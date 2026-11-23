import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "../../database/queries/repository";
import { HttpError } from "../middleware/security";
import { pickRandomAvatarId } from "../services/profile/avatars";

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  authProvider: "email" | "google";
};

export const SESSION_COOKIE_NAME = "__ss_session";
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100_000;
const DUMMY_SALT_HEX = "00112233445566778899aabbccddeeff";
const SIGN_IN_PATH = "/signin";

type AuthUserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  password_salt: string | null;
  auth_provider: string;
  google_sub: string | null;
};

function runtimeEnv(): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal string.");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return timingSafeEqualBytes(enc.encode(a), enc.encode(b));
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePasswordBytes(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
): Promise<{ hashHex: string; saltHex: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePasswordBytes(password, salt);
  return { hashHex: bytesToHex(derived), saltHex: bytesToHex(salt) };
}

export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string,
): Promise<boolean> {
  try {
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);
    const actual = await derivePasswordBytes(password, salt);
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "Enter a valid email address.");
  }
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  ) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "Enter a password of 10–128 characters.");
  }
  if (value.length < 10 || value.length > 128) {
    throw new HttpError(400, "Password must be 10–128 characters.");
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new HttpError(
      400,
      "Password must include at least one letter and one number.",
    );
  }
  return value;
}

export function validateDisplayName(value: unknown, email: string): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    const local = email.split("@")[0].replace(/[^A-Za-z0-9._ -]/g, "").trim();
    return (local || "Researcher").slice(0, 40);
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "Display name must be 1–40 characters.");
  }
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 40) {
    throw new HttpError(400, "Display name must be 1–40 characters.");
  }
  return clean;
}

export function parseCookieHeader(
  headerValue: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headerValue) return out;
  for (const part of headerValue.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (name && !(name in out)) out[name] = val;
  }
  return out;
}

function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export function formatCookie(
  name: string,
  value: string,
  request: Request,
  maxAge: number,
): string {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  return formatCookie(SESSION_COOKIE_NAME, "", request, 0);
}

export async function createSession(
  userId: string,
  request: Request,
): Promise<string> {
  const db = database();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = nowMs + SESSION_TTL_SECONDS * 1000;

  await db.batch([
    db
      .prepare("DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?")
      .bind(userId, nowMs),
    db
      .prepare(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(tokenHash, userId, expiresAt, nowIso, nowIso),
  ]);

  return formatCookie(SESSION_COOKIE_NAME, token, request, SESSION_TTL_SECONDS);
}

export async function revokeSessionFromRequest(
  request: Request,
): Promise<void> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return;
  const tokenHash = await sha256Hex(token);
  await database()
    .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await database()
    .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function registerEmailUser(input: {
  email: unknown;
  password: unknown;
  displayName?: unknown;
}): Promise<AuthenticatedUser> {
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  const displayName = validateDisplayName(input.displayName, email);
  const db = database();

  const existing = await db
    .prepare("SELECT id FROM auth_users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    throw new HttpError(
      409,
      "An account with this email already exists. Sign in instead.",
    );
  }

  const { hashHex, saltHex } = await hashPassword(password);
  const id = "usr_" + crypto.randomUUID();
  const now = new Date().toISOString();
  const recentAvatars = await db
    .prepare(
      "SELECT avatar_id FROM auth_users WHERE avatar_id IS NOT NULL ORDER BY created_at DESC LIMIT 8",
    )
    .all<{ avatar_id: string }>()
    .then((r) => (r.results ?? []).map((x) => x.avatar_id))
    .catch(() => [] as string[]);
  const initialAvatarId = pickRandomAvatarId(recentAvatars);

  try {
    try {
      await db
        .prepare(
          "INSERT INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, avatar_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?)",
        )
        .bind(id, email, displayName, hashHex, saltHex, initialAvatarId, now, now)
        .run();
    } catch (colErr) {
      if (/no column named avatar_id/i.test(String(colErr))) {
        await db
          .prepare(
            "INSERT INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'email', ?, ?)",
          )
          .bind(id, email, displayName, hashHex, saltHex, now, now)
          .run();
      } else {
        throw colErr;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) {
      throw new HttpError(
        409,
        "An account with this email already exists. Sign in instead.",
      );
    }
    throw error;
  }

  return {
    userId: id,
    displayName,
    email,
    fullName: displayName,
    authProvider: "email",
  };
}

export async function authenticateEmailUser(input: {
  email: unknown;
  password: unknown;
}): Promise<AuthenticatedUser> {
  const email = normalizeEmail(input.email);
  if (
    typeof input.password !== "string" ||
    input.password.length === 0 ||
    input.password.length > 128
  ) {
    throw new HttpError(401, "Invalid email or password.");
  }
  const db = database();
  const row = await db
    .prepare(
      "SELECT id, email, display_name, password_hash, password_salt, auth_provider, google_sub FROM auth_users WHERE email = ?",
    )
    .bind(email)
    .first<AuthUserRow>();

  if (!row || !row.password_hash || !row.password_salt) {
    // Perform equivalent PBKDF2 work to reduce user-enumeration timing signal.
    await derivePasswordBytes(input.password, hexToBytes(DUMMY_SALT_HEX));
    throw new HttpError(401, "Invalid email or password.");
  }

  const valid = await verifyPassword(
    input.password,
    row.password_hash,
    row.password_salt,
  );
  if (!valid) {
    throw new HttpError(401, "Invalid email or password.");
  }

  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    fullName: row.display_name,
    authProvider: row.auth_provider === "google" ? "google" : "email",
  };
}

export async function getAuthenticatedUser(
  request?: Request,
): Promise<AuthenticatedUser | null> {
  const cookieHeader = request
    ? request.headers.get("cookie")
    : (await headers()).get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;

  const tokenHash = await sha256Hex(token);
  const nowMs = Date.now();
  const row = await database()
    .prepare(
      "SELECT u.id, u.email, u.display_name, u.auth_provider FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(tokenHash, nowMs)
    .first<{
      id: string;
      email: string;
      display_name: string;
      auth_provider: string;
    }>();

  if (!row) return null;

  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    fullName: row.display_name,
    authProvider: row.auth_provider === "google" ? "google" : "email",
  };
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}

export function signInPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function safeRelativeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (
    url.pathname === SIGN_IN_PATH ||
    url.pathname.startsWith("/api/auth")
  ) {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getGoogleOAuthConfig(): {
  clientId: string;
  clientSecret: string;
} | null {
  const e = runtimeEnv();
  const clientId = e.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = e.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

export async function findOrCreateGoogleUser(profile: {
  sub: string;
  email: string;
  name?: string;
}): Promise<AuthenticatedUser> {
  const db = database();
  const email = normalizeEmail(profile.email);
  const bySub = await db
    .prepare(
      "SELECT id, email, display_name, auth_provider FROM auth_users WHERE google_sub = ?",
    )
    .bind(profile.sub)
    .first<{
      id: string;
      email: string;
      display_name: string;
      auth_provider: string;
    }>();

  if (bySub) {
    return {
      userId: bySub.id,
      displayName: bySub.display_name,
      email: bySub.email,
      fullName: bySub.display_name,
      authProvider: "google",
    };
  }

  const byEmail = await db
    .prepare("SELECT id, auth_provider FROM auth_users WHERE email = ?")
    .bind(email)
    .first<{ id: string; auth_provider: string }>();
  if (byEmail) {
    throw new HttpError(
      409,
      "An email/password account already exists for this address. Sign in with your password.",
    );
  }

  const id = "usr_" + crypto.randomUUID();
  const displayName = validateDisplayName(profile.name, email);
  const now = new Date().toISOString();
  const recentAvatars = await db
    .prepare(
      "SELECT avatar_id FROM auth_users WHERE avatar_id IS NOT NULL ORDER BY created_at DESC LIMIT 8",
    )
    .all<{ avatar_id: string }>()
    .then((r) => (r.results ?? []).map((x) => x.avatar_id))
    .catch(() => [] as string[]);
  const initialAvatarId = pickRandomAvatarId(recentAvatars);
  try {
    await db
      .prepare(
        "INSERT INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, google_sub, avatar_id, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 'google', ?, ?, ?, ?)",
      )
      .bind(id, email, displayName, profile.sub, initialAvatarId, now, now)
      .run();
  } catch (colErr) {
    if (/no column named avatar_id/i.test(String(colErr))) {
      await db
        .prepare(
          "INSERT INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, google_sub, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 'google', ?, ?, ?)",
        )
        .bind(id, email, displayName, profile.sub, now, now)
        .run();
    } else {
      throw colErr;
    }
  }

  return {
    userId: id,
    displayName,
    email,
    fullName: displayName,
    authProvider: "google",
  };
}
