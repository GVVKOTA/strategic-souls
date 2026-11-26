import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "../../database/queries/repository";
import { HttpError } from "../middleware/security";
import { APP_RELEASE } from "../services/release-meta";
import { pickRandomAvatarId } from "../services/profile/avatars";
import {
  isSecurityEmailConfigured,
  sendSecurityEmail,
} from "./email-transport";

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  authProvider: "email";
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
};

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

export function parseDeviceLabel(rawUserAgent: string | null): string {
  const ua = (rawUserAgent || "").trim();
  if (!ua) return "Web session";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return os ? `${browser} on ${os}` : browser;
}

function extractIpHint(request: Request): string | null {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  if (!raw) return null;
  if (raw === "127.0.0.1" || raw === "::1" || raw === "localhost") {
    return "Local device";
  }
  const v4 = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.x`;
  if (raw.includes(":")) {
    const parts = raw.split(":").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}::` : null;
  }
  return null;
}

export async function getSessionTokenHashFromRequest(
  request: Request,
): Promise<string | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  return sha256Hex(token);
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
  const rawUa = (request.headers.get("user-agent") || "").slice(0, 180);
  const deviceLabel = parseDeviceLabel(rawUa);
  const ipHint = extractIpHint(request);

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

  try {
    await db
      .prepare(
        `INSERT OR REPLACE INTO v3_session_meta
           (token_hash, user_id, device_label, user_agent, ip_hint, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(tokenHash, userId, deviceLabel, rawUa, ipHint, nowIso, nowIso)
      .run();
  } catch {
    /* Graceful fallback if v3_session_meta is absent in a legacy snapshot */
  }

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
      "SELECT id, email, display_name, password_hash, password_salt FROM auth_users WHERE email = ?",
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
    authProvider: "email",
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
      "SELECT u.id, u.email, u.display_name FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(tokenHash, nowMs)
    .first<{
      id: string;
      email: string;
      display_name: string;
    }>();

  if (!row) return null;

  return {
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    fullName: row.display_name,
    authProvider: "email",
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

export type ActiveSessionItem = {
  id: string;
  deviceLabel: string;
  ipHint: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

async function safeSessionId(tokenHash: string): Promise<string> {
  const digest = await sha256Hex(`ss-sid:${tokenHash}`);
  return digest.slice(0, 20);
}

/**
 * Lists active unexpired sessions for the authenticated user without exposing raw tokens or token_hash.
 */
export async function listActiveSessions(
  userId: string,
  currentTokenHash: string | null,
): Promise<ActiveSessionItem[]> {
  const db = database();
  const nowMs = Date.now();
  let rows: {
    token_hash: string;
    created_at: string;
    last_seen_at: string;
    expires_at: number;
    device_label?: string | null;
    ip_hint?: string | null;
    meta_last_seen?: string | null;
  }[] = [];

  try {
    const res = await db
      .prepare(
        `SELECT
           s.token_hash,
           s.created_at,
           s.last_seen_at,
           s.expires_at,
           m.device_label,
           m.ip_hint,
           m.last_seen_at AS meta_last_seen
         FROM auth_sessions s
         LEFT JOIN v3_session_meta m ON m.token_hash = s.token_hash
         WHERE s.user_id = ? AND s.expires_at > ?
         ORDER BY COALESCE(m.last_seen_at, s.last_seen_at) DESC, s.created_at DESC
         LIMIT 30`,
      )
      .bind(userId, nowMs)
      .all<(typeof rows)[number]>();
    rows = res.results ?? [];
  } catch {
    const res = await db
      .prepare(
        `SELECT token_hash, created_at, last_seen_at, expires_at
         FROM auth_sessions
         WHERE user_id = ? AND expires_at > ?
         ORDER BY last_seen_at DESC
         LIMIT 30`,
      )
      .bind(userId, nowMs)
      .all<(typeof rows)[number]>();
    rows = res.results ?? [];
  }

  const out: ActiveSessionItem[] = [];
  for (const r of rows) {
    out.push({
      id: await safeSessionId(r.token_hash),
      deviceLabel: r.device_label?.trim() || "Web session",
      ipHint: r.ip_hint ?? null,
      createdAt: r.created_at,
      lastSeenAt: r.meta_last_seen || r.last_seen_at,
      expiresAt: new Date(r.expires_at).toISOString(),
      isCurrent: currentTokenHash !== null && r.token_hash === currentTokenHash,
    });
  }
  return out;
}

export async function revokeSessionBySafeId(
  userId: string,
  sessionId: string,
  currentTokenHash: string | null,
): Promise<{ revoked: boolean; revokedCurrent: boolean }> {
  if (!/^[a-f0-9]{20}$/i.test(sessionId)) {
    throw new HttpError(400, "Invalid session identifier.");
  }
  const db = database();
  const res = await db
    .prepare(
      "SELECT token_hash FROM auth_sessions WHERE user_id = ? AND expires_at > ?",
    )
    .bind(userId, Date.now())
    .all<{ token_hash: string }>();

  let matchedHash: string | null = null;
  for (const r of res.results ?? []) {
    if ((await safeSessionId(r.token_hash)) === sessionId.toLowerCase()) {
      matchedHash = r.token_hash;
      break;
    }
  }
  if (!matchedHash) {
    throw new HttpError(404, "Active session not found.");
  }
  await db
    .prepare("DELETE FROM auth_sessions WHERE token_hash = ? AND user_id = ?")
    .bind(matchedHash, userId)
    .run();
  return {
    revoked: true,
    revokedCurrent: currentTokenHash !== null && matchedHash === currentTokenHash,
  };
}

export async function revokeOtherUserSessions(
  userId: string,
  currentTokenHash: string | null,
): Promise<{ revokedCount: number }> {
  const db = database();
  if (!currentTokenHash) {
    const res = await db
      .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
      .bind(userId)
      .run();
    return { revokedCount: Number(res.meta.changes ?? 0) };
  }
  const res = await db
    .prepare("DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?")
    .bind(userId, currentTokenHash)
    .run();
  return { revokedCount: Number(res.meta.changes ?? 0) };
}

/**
 * Authenticated password change with current-password reauthentication,
 * password strength enforcement, and revocation of all other sessions.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: unknown,
  newPassword: unknown,
  request: Request,
): Promise<{ cookie: string }> {
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length === 0 ||
    currentPassword.length > 128
  ) {
    throw new HttpError(400, "Enter your current password.");
  }
  const validatedNew = validatePassword(newPassword);
  if (currentPassword === validatedNew) {
    throw new HttpError(
      400,
      "Choose a new password that differs from your current password.",
    );
  }
  const db = database();
  const row = await db
    .prepare(
      "SELECT id, password_hash, password_salt FROM auth_users WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{
      id: string;
      password_hash: string | null;
      password_salt: string | null;
    }>();
  if (!row || !row.password_hash || !row.password_salt) {
    throw new HttpError(
      400,
      "Password change is available for email/password accounts.",
    );
  }
  const ok = await verifyPassword(
    currentPassword,
    row.password_hash,
    row.password_salt,
  );
  if (!ok) {
    throw new HttpError(401, "Current password is incorrect.");
  }
  const { hashHex, saltHex } = await hashPassword(validatedNew);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE auth_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
      )
      .bind(hashHex, saltHex, now, userId),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
  ]);
  const cookie = await createSession(userId, request);
  return { cookie };
}

const TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Non-enumerating forgot-password flow (V3 Sec 09.3).
 * Creates a single-use, 30-minute, SHA-256-hashed token in v3_auth_tokens
 * and attempts delivery via configured transactional email transport.
 * Never reveals whether the account exists and never returns raw tokens over HTTP.
 */
export async function requestPasswordReset(
  rawEmail: unknown,
  origin: string,
): Promise<{
  accepted: true;
  emailDeliveryConfigured: boolean;
  message: string;
}> {
  const email = normalizeEmail(rawEmail);
  const db = database();
  const configured = isSecurityEmailConfigured();
  const user = await db
    .prepare(
      "SELECT id, email, password_hash FROM auth_users WHERE email = ? LIMIT 1",
    )
    .bind(email)
    .first<{ id: string; email: string; password_hash: string | null }>();

  if (user && user.password_hash) {
    const rawToken = randomToken(32);
    const tokenHash = await sha256Hex(rawToken);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = nowMs + TOKEN_TTL_MS;

    await db.batch([
      db
        .prepare(
          "UPDATE v3_auth_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL",
        )
        .bind(nowIso, user.id),
      db
        .prepare(
          `INSERT INTO v3_auth_tokens
             (id, user_id, purpose, token_hash, target_email, expires_at, consumed_at, created_at)
           VALUES (?, ?, 'PASSWORD_RESET', ?, NULL, ?, NULL, ?)`,
        )
        .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, nowIso),
    ]);

    const resetUrl = `${origin.replace(/\/$/, "")}/signin?reset_token=${encodeURIComponent(rawToken)}`;
    await sendSecurityEmail({
      to: user.email,
      purpose: "PASSWORD_RESET",
      subject: "Reset your Strategic Souls password",
      text: [
        "A password reset was requested for your Strategic Souls account.",
        `Reset link (valid for 30 minutes, single use): ${resetUrl}`,
        `Reset code: ${rawToken}`,
        "If you did not request this, you can safely ignore this message.",
      ].join("\n\n"),
      token: rawToken,
      actionUrl: resetUrl,
    });
  } else {
    // Perform equivalent hash work so timing does not enumerate existing accounts.
    await sha256Hex(randomToken(32));
  }

  return {
    accepted: true,
    emailDeliveryConfigured: configured,
    message: configured
      ? "If an account exists for that email address, password reset instructions have been sent. Reset links expire in 30 minutes."
      : `If an account exists for that email address, a reset request was recorded. Outbound email delivery is not configured on this deployment yet — contact ${APP_RELEASE.supportEmail} if you need manual recovery assistance.`,
  };
}

/**
 * Completes a password reset using a single-use unconsumed token, updates password hash,
 * and revokes all active sessions for the user.
 */
export async function completePasswordReset(
  rawToken: unknown,
  newPassword: unknown,
): Promise<{ reset: true }> {
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(rawToken.trim())
  ) {
    throw new HttpError(400, "Reset token is invalid or has expired.");
  }
  const validatedNew = validatePassword(newPassword);
  const tokenHash = await sha256Hex(rawToken.trim());
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const db = database();

  const row = await db
    .prepare(
      `SELECT id, user_id, expires_at, consumed_at
       FROM v3_auth_tokens
       WHERE token_hash = ? AND purpose = 'PASSWORD_RESET'
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{
      id: string;
      user_id: string;
      expires_at: number;
      consumed_at: string | null;
    }>();

  if (!row || row.consumed_at !== null || row.expires_at <= nowMs) {
    throw new HttpError(400, "Reset token is invalid or has expired.");
  }

  const consumed = await db
    .prepare(
      `UPDATE v3_auth_tokens
       SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .bind(nowIso, row.id, nowMs)
    .run();
  if (!consumed.meta.changes) {
    throw new HttpError(400, "Reset token has already been used or expired.");
  }

  const { hashHex, saltHex } = await hashPassword(validatedNew);
  await db.batch([
    db
      .prepare(
        "UPDATE auth_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
      )
      .bind(hashHex, saltHex, nowIso, row.user_id),
    db
      .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
      .bind(row.user_id),
  ]);
  return { reset: true };
}

/**
 * Initiates an authenticated email change / verification flow.
 * Requires current-password reauthentication; never updates auth_users.email until confirmed.
 */
export async function requestEmailChange(
  userId: string,
  currentPassword: unknown,
  rawNewEmail: unknown,
  origin: string,
): Promise<{
  pendingEmail: string;
  emailDeliveryConfigured: boolean;
  delivered: boolean;
  message: string;
}> {
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length === 0 ||
    currentPassword.length > 128
  ) {
    throw new HttpError(400, "Enter your current password to verify email changes.");
  }
  const newEmail = normalizeEmail(rawNewEmail);
  const db = database();
  const user = await db
    .prepare(
      "SELECT id, email, password_hash, password_salt FROM auth_users WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      password_hash: string | null;
      password_salt: string | null;
    }>();
  if (!user || !user.password_hash || !user.password_salt) {
    throw new HttpError(
      400,
      "Email change requires a password-authenticated account.",
    );
  }
  const ok = await verifyPassword(
    currentPassword,
    user.password_hash,
    user.password_salt,
  );
  if (!ok) {
    throw new HttpError(401, "Current password is incorrect.");
  }
  if (newEmail !== user.email.toLowerCase()) {
    const taken = await db
      .prepare("SELECT id FROM auth_users WHERE email = ? AND id != ? LIMIT 1")
      .bind(newEmail, userId)
      .first<{ id: string }>();
    if (taken) {
      throw new HttpError(409, "That email address is already registered.");
    }
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = nowMs + TOKEN_TTL_MS;

  await db.batch([
    db
      .prepare(
        "UPDATE v3_auth_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'EMAIL_VERIFY' AND consumed_at IS NULL",
      )
      .bind(nowIso, userId),
    db
      .prepare(
        `INSERT INTO v3_auth_tokens
           (id, user_id, purpose, token_hash, target_email, expires_at, consumed_at, created_at)
         VALUES (?, ?, 'EMAIL_VERIFY', ?, ?, ?, NULL, ?)`,
      )
      .bind(crypto.randomUUID(), userId, tokenHash, newEmail, expiresAt, nowIso),
  ]);

  const verifyUrl = `${origin.replace(/\/$/, "")}/?view=settings&verify_email=${encodeURIComponent(rawToken)}`;
  const delivery = await sendSecurityEmail({
    to: newEmail,
    purpose: "EMAIL_VERIFY",
    subject: "Verify your Strategic Souls email address",
    text: [
      `Confirm ${newEmail} for your Strategic Souls account.`,
      `Verification code (valid for 30 minutes, single use): ${rawToken}`,
      `Link: ${verifyUrl}`,
    ].join("\n\n"),
    token: rawToken,
    actionUrl: verifyUrl,
  });

  return {
    pendingEmail: newEmail,
    emailDeliveryConfigured: delivery.configured,
    delivered: delivery.delivered,
    message: delivery.delivered
      ? `Verification code sent to ${newEmail}. Enter the code below within 30 minutes to complete the change.`
      : `Verification request created for ${newEmail}, but outbound email delivery is not configured on this deployment yet. Your current email stays active until verified.`,
  };
}

export async function confirmEmailChange(
  userId: string,
  rawToken: unknown,
): Promise<{ email: string; verifiedAt: string }> {
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(rawToken.trim())
  ) {
    throw new HttpError(400, "Verification token is invalid or has expired.");
  }
  const tokenHash = await sha256Hex(rawToken.trim());
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const db = database();

  const row = await db
    .prepare(
      `SELECT id, user_id, target_email, expires_at, consumed_at
       FROM v3_auth_tokens
       WHERE token_hash = ? AND user_id = ? AND purpose = 'EMAIL_VERIFY'
       LIMIT 1`,
    )
    .bind(tokenHash, userId)
    .first<{
      id: string;
      user_id: string;
      target_email: string | null;
      expires_at: number;
      consumed_at: string | null;
    }>();

  if (!row || !row.target_email || row.consumed_at !== null || row.expires_at <= nowMs) {
    throw new HttpError(400, "Verification token is invalid or has expired.");
  }

  const taken = await db
    .prepare("SELECT id FROM auth_users WHERE email = ? AND id != ? LIMIT 1")
    .bind(row.target_email, userId)
    .first<{ id: string }>();
  if (taken) {
    throw new HttpError(409, "That email address is already registered.");
  }

  const consumed = await db
    .prepare(
      `UPDATE v3_auth_tokens
       SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .bind(nowIso, row.id, nowMs)
    .run();
  if (!consumed.meta.changes) {
    throw new HttpError(400, "Verification token has already been used or expired.");
  }

  await db.batch([
    db
      .prepare("UPDATE auth_users SET email = ?, updated_at = ? WHERE id = ?")
      .bind(row.target_email, nowIso, userId),
    db
      .prepare(
        `INSERT INTO v3_user_email_verification (user_id, verified_email, verified_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           verified_email = excluded.verified_email,
           verified_at = excluded.verified_at,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, row.target_email, nowIso, nowIso),
  ]);

  return { email: row.target_email, verifiedAt: nowIso };
}

export async function getEmailVerificationStatus(
  userId: string,
  currentEmail: string,
): Promise<{
  verified: boolean;
  verifiedAt: string | null;
  pendingEmail: string | null;
  emailDeliveryConfigured: boolean;
}> {
  const db = database();
  const configured = isSecurityEmailConfigured();
  try {
    const [verRow, pendingRow] = await Promise.all([
      db
        .prepare(
          "SELECT verified_email, verified_at FROM v3_user_email_verification WHERE user_id = ? LIMIT 1",
        )
        .bind(userId)
        .first<{ verified_email: string | null; verified_at: string | null }>(),
      db
        .prepare(
          `SELECT target_email FROM v3_auth_tokens
           WHERE user_id = ? AND purpose = 'EMAIL_VERIFY' AND consumed_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(userId, Date.now())
        .first<{ target_email: string | null }>(),
    ]);
    const verified =
      Boolean(verRow?.verified_email) &&
      verRow!.verified_email!.toLowerCase() === currentEmail.toLowerCase();
    return {
      verified,
      verifiedAt: verified ? verRow?.verified_at ?? null : null,
      pendingEmail: pendingRow?.target_email ?? null,
      emailDeliveryConfigured: configured,
    };
  } catch {
    return {
      verified: false,
      verifiedAt: null,
      pendingEmail: null,
      emailDeliveryConfigured: configured,
    };
  }
}
