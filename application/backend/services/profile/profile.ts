import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { bodyHandle, field } from "../community/community-model";
import {
  DEFAULT_AVATAR_ID,
  isValidAvatarPresetId,
  normalizeAvatarId,
  pickRandomAvatarId,
} from "./avatars";
import {
  DEFAULT_BANNER_ID,
  DEFAULT_PORTFOLIO_BACKDROP_ID,
  isValidBannerPresetId,
  resolveBannerPreset,
  resolvePortfolioBackdropPreset,
} from "./banners";
import {
  getIndianStateByCode,
  normalizeStoredStateCode,
  parseIndianStateCode,
} from "./indian-states";

async function getSocialCounts(subject: string): Promise<{
  followers: number;
  following: number;
  publishedSouls: number;
}> {
  const db = database();
  try {
    const [followersRow, followingRow, soulsRow] = await Promise.all([
      db
        .prepare(
          "SELECT count(*) AS n FROM x51_follows WHERE target_subject=? AND state='ACTIVE'",
        )
        .bind(subject)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT count(*) AS n FROM x51_follows WHERE follower_subject=? AND state='ACTIVE'",
        )
        .bind(subject)
        .first<{ n: number }>(),
      db
        .prepare(
          "SELECT count(*) AS n FROM x51_web_souls WHERE author_subject=? AND deleted_at IS NULL",
        )
        .bind(subject)
        .first<{ n: number }>(),
    ]);
    return {
      followers: Number(followersRow?.n ?? 0),
      following: Number(followingRow?.n ?? 0),
      publishedSouls: Number(soulsRow?.n ?? 0),
    };
  } catch {
    return { followers: 0, following: 0, publishedSouls: 0 };
  }
}

const CONSENT_VERSION = "2026-11-14-v4";
const PROFILE_RECORD_KIND = "account-profile";

export type MotionPreference = "system" | "minimal" | "full";
export type DensityPreference = "comfortable" | "compact";
export type EarthQualityPreference = "auto" | "balanced" | "reduced";
export type GenderSymbolOption = "MALE" | "FEMALE" | "HIDDEN";
export type BannerPosition = "top" | "center" | "bottom";

export type PortfolioBackdropSettings = {
  presetId: string;
  position: BannerPosition;
  overlay: number;
  blur: number;
};

export type UiPreferences = {
  motion: MotionPreference;
  density: DensityPreference;
  earthQuality: EarthQualityPreference;
  privateTickerEnabled?: boolean;
  privateTickerMode?: "HOLDINGS" | "WATCHLIST";
};

export type StoredProfileRecord = {
  avatarKind: "preset";
  avatarPresetId: string;
  bannerPresetId?: string;
  bannerPosition?: BannerPosition;
  bannerOverlay?: number;
  stateCode?: string | null;
  age?: number | null;
  showAge?: boolean;
  genderSymbol?: GenderSymbolOption;
  instagramHandle?: string;
  websiteUrl?: string;
  researchInterests?: string[];
  portfolioBackdrop?: PortfolioBackdropSettings;
  defaultPostAudience?: "PUBLIC" | "FOLLOWERS" | "GROUP";
  preferences: UiPreferences;
  updatedAt: string;
};

export type SocialSettingsSnapshot = {
  discoverable: boolean;
  messages: "REQUESTS" | "GROUPS" | "NONE";
  receipts: boolean;
  notifications: boolean;
};

export type UserProfileSnapshot = {
  displayName: string;
  email: string;
  authProvider: "email" | "google";
  handle: string | null;
  bio: string;
  avatarKind: "preset";
  avatarId: string;
  bannerPresetId: string;
  bannerPosition: BannerPosition;
  bannerOverlay: number;
  stateCode: string | null;
  stateName: string | null;
  age: number | null;
  showAge: boolean;
  genderSymbol: GenderSymbolOption;
  instagramHandle: string;
  websiteUrl: string;
  researchInterests: string[];
  portfolioBackdrop: PortfolioBackdropSettings;
  defaultPostAudience: "PUBLIC" | "FOLLOWERS" | "GROUP";
  counts: {
    followers: number;
    following: number;
    publishedSouls: number;
  };
  hasCommunityProfile: boolean;
  legacyPrivateProfile: boolean;
  preferences: UiPreferences;
  social: SocialSettingsSnapshot;
  unreadNotifications: number;
  notifications: {
    id: string;
    kind: string;
    targetId: string;
    createdAt: string;
    readAt: string | null;
  }[];
  blocked: { handle: string; displayName: string }[];
  updatedAt: string | null;
};

export const DEFAULT_PORTFOLIO_BACKDROP: PortfolioBackdropSettings = {
  presetId: DEFAULT_PORTFOLIO_BACKDROP_ID,
  position: "center",
  overlay: 0.72,
  blur: 4,
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  motion: "system",
  density: "comfortable",
  earthQuality: "auto",
  privateTickerEnabled: false,
  privateTickerMode: "HOLDINGS",
};

const DEFAULT_SOCIAL: SocialSettingsSnapshot = {
  discoverable: false,
  messages: "REQUESTS",
  receipts: false,
  notifications: true,
};

function parsePreferences(raw: unknown): UiPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_UI_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const motion: MotionPreference =
    obj.motion === "minimal" || obj.motion === "full" ? obj.motion : "system";
  const density: DensityPreference =
    obj.density === "compact" ? "compact" : "comfortable";
  const earthQuality: EarthQualityPreference =
    obj.earthQuality === "balanced" || obj.earthQuality === "reduced"
      ? obj.earthQuality
      : "auto";
  const privateTickerEnabled = obj.privateTickerEnabled === true;
  const privateTickerMode =
    obj.privateTickerMode === "WATCHLIST" ? "WATCHLIST" : "HOLDINGS";
  return {
    motion,
    density,
    earthQuality,
    privateTickerEnabled,
    privateTickerMode,
  };
}

function parseGenderSymbol(raw: unknown): GenderSymbolOption {
  return raw === "MALE" || raw === "FEMALE" ? raw : "HIDDEN";
}

function parseAge(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 18 || n > 120) {
    throw new HttpError(400, "Age must be a whole number between 18 and 120 (or left blank).");
  }
  return n;
}

function parseStoredAge(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  return raw >= 18 && raw <= 120 ? raw : null;
}

function parseBannerPosition(raw: unknown): BannerPosition {
  return raw === "top" || raw === "bottom" ? raw : "center";
}

function sanitizeInstagram(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().replace(/^@/, "");
  if (!cleaned) return "";
  if (!/^[A-Za-z0-9._]{1,30}$/.test(cleaned)) {
    throw new HttpError(
      400,
      "Instagram handle may contain 1–30 letters, numbers, dots, or underscores.",
    );
  }
  return cleaned;
}

function sanitizeWebsite(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const trimmed = raw.trim();
  if (trimmed.length > 200) {
    throw new HttpError(400, "Website URL must be 200 characters or fewer.");
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("HTTPS required");
    }
    return parsed.toString();
  } catch {
    throw new HttpError(400, "Website link must be a valid https:// URL.");
  }
}

function sanitizeInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 28))
        .filter((x) => x.length >= 2),
    ),
  ].slice(0, 6);
}

function parsePortfolioBackdrop(raw: unknown): PortfolioBackdropSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PORTFOLIO_BACKDROP };
  const o = raw as Record<string, unknown>;
  const overlay =
    typeof o.overlay === "number" && Number.isFinite(o.overlay)
      ? Math.max(0.4, Math.min(0.92, o.overlay))
      : DEFAULT_PORTFOLIO_BACKDROP.overlay;
  const blur =
    typeof o.blur === "number" && Number.isFinite(o.blur)
      ? Math.max(0, Math.min(16, Math.round(o.blur)))
      : DEFAULT_PORTFOLIO_BACKDROP.blur;
  return {
    presetId: resolvePortfolioBackdropPreset(
      typeof o.presetId === "string" ? o.presetId : null,
    ).id,
    position: parseBannerPosition(o.position),
    overlay,
    blur,
  };
}

function profileRecordId(subject: string): string {
  return "profile:" + subject;
}

async function readStoredProfileRecord(
  subject: string,
): Promise<StoredProfileRecord | null> {
  try {
    const row = await database()
      .prepare(
        "SELECT payload, updated_at FROM x1_records WHERE subject = ? AND kind = ? AND archived = 0 ORDER BY updated_at DESC LIMIT 1",
      )
      .bind(subject, PROFILE_RECORD_KIND)
      .first<{ payload: string; updated_at: string }>();
    if (!row) return null;
    const parsed = JSON.parse(row.payload) as Record<string, unknown>;
    return {
      avatarKind: "preset",
      avatarPresetId: normalizeAvatarId(parsed.avatarPresetId),
      bannerPresetId: resolveBannerPreset(
        typeof parsed.bannerPresetId === "string" ? parsed.bannerPresetId : null,
      ).id,
      bannerPosition: parseBannerPosition(parsed.bannerPosition),
      bannerOverlay:
        typeof parsed.bannerOverlay === "number" &&
        Number.isFinite(parsed.bannerOverlay)
          ? Math.max(0.35, Math.min(0.92, parsed.bannerOverlay))
          : 0.65,
      stateCode: normalizeStoredStateCode(parsed.stateCode),
      age: parseStoredAge(parsed.age),
      showAge: parsed.showAge === true,
      genderSymbol: parseGenderSymbol(parsed.genderSymbol),
      instagramHandle:
        typeof parsed.instagramHandle === "string" ? parsed.instagramHandle : "",
      websiteUrl:
        typeof parsed.websiteUrl === "string" ? parsed.websiteUrl : "",
      researchInterests: sanitizeInterests(parsed.researchInterests),
      portfolioBackdrop: parsePortfolioBackdrop(parsed.portfolioBackdrop),
      defaultPostAudience:
        parsed.defaultPostAudience === "FOLLOWERS" ||
        parsed.defaultPostAudience === "GROUP"
          ? parsed.defaultPostAudience
          : "PUBLIC",
      preferences: parsePreferences(parsed.preferences),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : row.updated_at,
    };
  } catch {
    return null;
  }
}

async function upsertStoredProfileRecord(
  subject: string,
  next: StoredProfileRecord,
): Promise<void> {
  const db = database();
  const id = profileRecordId(subject);
  const now = next.updatedAt;
  const payload = JSON.stringify(next);
  await db
    .prepare(
      `INSERT INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
       VALUES (?, ?, ?, 'Account Profile', ?, 1, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         version = x1_records.version + 1,
         last_write = excluded.last_write,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      subject,
      PROFILE_RECORD_KIND,
      payload,
      crypto.randomUUID(),
      now,
      now,
    )
    .run();
}

async function ensureConsentAccount(
  subject: string,
  fallbackDisplayName: string,
): Promise<void> {
  const current = await account(subject);
  if (
    !current ||
    current.adult_confirmed !== 1 ||
    current.consent_version !== CONSENT_VERSION
  ) {
    throw new HttpError(
      403,
      "Confirm the adult research, privacy, and terms notices before saving profile changes.",
    );
  }
  void fallbackDisplayName;
}

async function resolveOrBackfillAvatarId(
  subject: string,
  storedAvatar?: string | null,
  bodyAvatar?: string | null,
): Promise<string> {
  if (storedAvatar && isValidAvatarPresetId(storedAvatar.trim().toLowerCase())) {
    return normalizeAvatarId(storedAvatar);
  }
  if (bodyAvatar && isValidAvatarPresetId(bodyAvatar.trim().toLowerCase())) {
    return normalizeAvatarId(bodyAvatar);
  }
  const db = database();
  const authRow = await db
    .prepare("SELECT avatar_id FROM auth_users WHERE id = ?")
    .bind(subject)
    .first<{ avatar_id: string | null }>()
    .catch(() => null);
  if (
    authRow?.avatar_id &&
    isValidAvatarPresetId(authRow.avatar_id.trim().toLowerCase())
  ) {
    return normalizeAvatarId(authRow.avatar_id);
  }

  // Safe, idempotent one-time backfill for existing accounts without a stored avatar.
  const assigned = pickRandomAvatarId();
  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE auth_users SET avatar_id = COALESCE(avatar_id, ?) WHERE id = ?",
    )
    .bind(assigned, subject)
    .run()
    .catch(() => {});

  const initialRecord: StoredProfileRecord = {
    avatarKind: "preset",
    avatarPresetId: assigned,
    bannerPresetId: DEFAULT_BANNER_ID,
    bannerPosition: "center",
    bannerOverlay: 0.65,
    stateCode: null,
    preferences: { ...DEFAULT_UI_PREFERENCES },
    updatedAt: now,
  };
  await db
    .prepare(
      `INSERT OR IGNORE INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
       VALUES (?, ?, ?, 'Account Profile', ?, 1, 0, ?, ?, ?)`,
    )
    .bind(
      profileRecordId(subject),
      subject,
      PROFILE_RECORD_KIND,
      JSON.stringify(initialRecord),
      crypto.randomUUID(),
      now,
      now,
    )
    .run()
    .catch(() => {});

  const afterAuth = await db
    .prepare("SELECT avatar_id FROM auth_users WHERE id = ?")
    .bind(subject)
    .first<{ avatar_id: string | null }>()
    .catch(() => null);
  if (
    afterAuth?.avatar_id &&
    isValidAvatarPresetId(afterAuth.avatar_id.trim().toLowerCase())
  ) {
    return normalizeAvatarId(afterAuth.avatar_id);
  }
  return assigned;
}

/** Fast summary used by /api/auth/session so top-right header renders real persisted avatar immediately. */
export async function getSessionProfileMeta(subject: string): Promise<{
  avatarId: string;
  handle: string | null;
  bio: string;
  discoverable: boolean;
  legacyPrivateProfile: boolean;
  unreadNotifications: number;
  stateCode: string | null;
  stateName: string | null;
  age: number | null;
  showAge: boolean;
  genderSymbol: GenderSymbolOption;
  instagramHandle: string;
  bannerPresetId: string;
  bannerPosition: BannerPosition;
  portfolioBackdrop: PortfolioBackdropSettings;
  defaultPostAudience: "PUBLIC" | "FOLLOWERS" | "GROUP";
  counts: { followers: number; following: number; publishedSouls: number };
  preferences: UiPreferences;
}> {
  const db = database();
  const [bodyRow, stored, prefsRow, unreadRow, counts] = await Promise.all([
    db
      .prepare("SELECT handle, bio, avatar FROM x1_bodies WHERE subject = ?")
      .bind(subject)
      .first<{ handle: string; bio: string; avatar: string }>()
      .catch(() => null),
    readStoredProfileRecord(subject),
    db
      .prepare(
        "SELECT discoverable FROM x2_social_preferences WHERE subject = ?",
      )
      .bind(subject)
      .first<{ discoverable: number }>()
      .catch(() => null),
    db
      .prepare(
        "SELECT count(*) AS count FROM x1_visible_notices WHERE subject = ? AND read_at IS NULL",
      )
      .bind(subject)
      .first<{ count: number }>()
      .catch(() => null),
    getSocialCounts(subject),
  ]);

  const avatarId = await resolveOrBackfillAvatarId(
    subject,
    stored?.avatarPresetId,
    bodyRow?.avatar,
  );
  const stateEntry = getIndianStateByCode(stored?.stateCode ?? null);

  return {
    avatarId,
    handle: bodyRow?.handle ?? null,
    bio: bodyRow?.bio ?? "",
    discoverable: !!prefsRow?.discoverable,
    legacyPrivateProfile: !!bodyRow && !prefsRow?.discoverable,
    unreadNotifications: Number(unreadRow?.count ?? 0),
    stateCode: stateEntry?.code ?? null,
    stateName: stateEntry?.name ?? null,
    age: stored?.age ?? null,
    showAge: stored?.showAge === true,
    genderSymbol: stored?.genderSymbol ?? "HIDDEN",
    instagramHandle: stored?.instagramHandle ?? "",
    bannerPresetId: stored?.bannerPresetId ?? DEFAULT_BANNER_ID,
    bannerPosition: stored?.bannerPosition ?? "center",
    portfolioBackdrop:
      stored?.portfolioBackdrop ?? { ...DEFAULT_PORTFOLIO_BACKDROP },
    defaultPostAudience: stored?.defaultPostAudience ?? "PUBLIC",
    counts,
    preferences: stored?.preferences ?? { ...DEFAULT_UI_PREFERENCES },
  };
}

/** Private owner-only profile & settings view for the authenticated user. */
export async function getPrivateProfile(user: {
  userId: string;
  displayName: string;
  email: string;
  authProvider: "email" | "google";
}): Promise<UserProfileSnapshot> {
  const db = database();
  const subject = user.userId;
  const [acc, bodyRow, stored, socialRow, notificationsRes, blockedRes, counts] =
    await Promise.all([
      account(subject).catch(() => null),
      db
        .prepare(
          "SELECT handle, display_name, bio, avatar, updated_at FROM x1_bodies WHERE subject = ?",
        )
        .bind(subject)
        .first<{
          handle: string;
          display_name: string;
          bio: string;
          avatar: string;
          updated_at: string;
        }>()
        .catch(() => null),
      readStoredProfileRecord(subject),
      db
        .prepare(
          "SELECT discoverable, messages, receipts, notifications FROM x2_social_preferences WHERE subject = ?",
        )
        .bind(subject)
        .first<{
          discoverable: number;
          messages: string;
          receipts: number;
          notifications: number;
        }>()
        .catch(() => null),
      db
        .prepare(
          "SELECT id, kind, target_id AS targetId, created_at AS createdAt, read_at AS readAt FROM x1_visible_notices WHERE subject = ? ORDER BY created_at DESC, id DESC LIMIT 40",
        )
        .bind(subject)
        .all<{
          id: string;
          kind: string;
          targetId: string;
          createdAt: string;
          readAt: string | null;
        }>()
        .catch(() => ({ results: [] })),
      db
        .prepare(
          "SELECT b.handle, b.display_name AS displayName FROM x2_blocks z JOIN x1_bodies b ON b.subject = z.target WHERE z.subject = ? ORDER BY b.handle LIMIT 100",
        )
        .bind(subject)
        .all<{ handle: string; displayName: string }>()
        .catch(() => ({ results: [] })),
      getSocialCounts(subject),
    ]);

  const notifications = notificationsRes.results ?? [];
  const unreadNotifications = notifications.filter((n) => !n.readAt).length;
  const avatarId = await resolveOrBackfillAvatarId(
    subject,
    stored?.avatarPresetId,
    bodyRow?.avatar,
  );
  const stateEntry = getIndianStateByCode(stored?.stateCode ?? null);
  const social: SocialSettingsSnapshot = socialRow
    ? {
        discoverable: !!socialRow.discoverable,
        messages:
          socialRow.messages === "GROUPS" || socialRow.messages === "NONE"
            ? socialRow.messages
            : "REQUESTS",
        receipts: !!socialRow.receipts,
        notifications: !!socialRow.notifications,
      }
    : { ...DEFAULT_SOCIAL };

  return {
    displayName: bodyRow?.display_name ?? acc?.alias ?? user.displayName,
    email: user.email,
    authProvider: user.authProvider,
    handle: bodyRow?.handle ?? null,
    bio: bodyRow?.bio ?? "",
    avatarKind: "preset",
    avatarId,
    bannerPresetId: stored?.bannerPresetId ?? DEFAULT_BANNER_ID,
    bannerPosition: stored?.bannerPosition ?? "center",
    bannerOverlay: stored?.bannerOverlay ?? 0.65,
    stateCode: stateEntry?.code ?? null,
    stateName: stateEntry?.name ?? null,
    age: stored?.age ?? null,
    showAge: stored?.showAge === true,
    genderSymbol: stored?.genderSymbol ?? "HIDDEN",
    instagramHandle: stored?.instagramHandle ?? "",
    websiteUrl: stored?.websiteUrl ?? "",
    researchInterests: stored?.researchInterests ?? [],
    portfolioBackdrop:
      stored?.portfolioBackdrop ?? { ...DEFAULT_PORTFOLIO_BACKDROP },
    defaultPostAudience: stored?.defaultPostAudience ?? "PUBLIC",
    counts,
    hasCommunityProfile: !!bodyRow,
    legacyPrivateProfile: !!bodyRow && !social.discoverable,
    preferences: stored?.preferences ?? { ...DEFAULT_UI_PREFERENCES },
    social,
    unreadNotifications,
    notifications,
    blocked: blockedRes.results ?? [],
    updatedAt: stored?.updatedAt ?? bodyRow?.updated_at ?? null,
  };
}

/**
 * Strictly self-owned profile mutations.
 * Never trusts an incoming userId or subject field — always binds to the authenticated session user.
 */
export async function mutatePrivateProfile(
  user: {
    userId: string;
    displayName: string;
    email: string;
    authProvider: "email" | "google";
  },
  input: Record<string, unknown>,
): Promise<UserProfileSnapshot> {
  const subject = user.userId;
  await rate(subject + ":x6-profile-write", 45, 60_000);
  await ensureConsentAccount(subject, user.displayName);

  const action = String(input.action ?? "");
  const db = database();
  const now = new Date().toISOString();
  const existingRecord = await readStoredProfileRecord(subject);

  if (action === "update-avatar") {
    const candidate =
      typeof input.avatarPresetId === "string"
        ? input.avatarPresetId
        : typeof input.avatarId === "string"
          ? input.avatarId
          : "";
    const rawId = candidate.trim().toLowerCase();
    if (!isValidAvatarPresetId(rawId)) {
      throw new HttpError(
        400,
        "Choose one of the 60 official Strategic Souls avatar presets (a01–f10).",
      );
    }

    const nextRecord: StoredProfileRecord = {
      ...(existingRecord ?? {
        avatarKind: "preset",
        avatarPresetId: DEFAULT_AVATAR_ID,
        preferences: { ...DEFAULT_UI_PREFERENCES },
        updatedAt: now,
      }),
      avatarKind: "preset",
      avatarPresetId: rawId,
      updatedAt: now,
    };

    await upsertStoredProfileRecord(subject, nextRecord);

    // Keep auth_users.avatar_id and Community x1_bodies.avatar synchronized
    await Promise.all([
      db
        .prepare("UPDATE auth_users SET avatar_id = ?, updated_at = ? WHERE id = ?")
        .bind(rawId, now, subject)
        .run()
        .catch(() => {}),
      db
        .prepare(
          "UPDATE x1_bodies SET avatar = ?, updated_at = ? WHERE subject = ?",
        )
        .bind(rawId, now, subject)
        .run(),
    ]);

    return getPrivateProfile(user);
  }

  if (action === "update-profile") {
    const displayName = field(input.displayName, "Display name", 40, 1);
    const bio =
      input.bio !== undefined ? field(input.bio, "Bio", 320, 0) : undefined;
    const rawHandle =
      typeof input.handle === "string" && input.handle.trim().length > 0
        ? bodyHandle(input.handle)
        : null;

    const existingBody = await db
      .prepare(
        "SELECT handle, bio, avatar FROM x1_bodies WHERE subject = ?",
      )
      .bind(subject)
      .first<{ handle: string; bio: string; avatar: string }>();

    const currentAvatarId =
      input.avatarPresetId !== undefined
        ? normalizeAvatarId(input.avatarPresetId)
        : await resolveOrBackfillAvatarId(
            subject,
            existingRecord?.avatarPresetId,
            existingBody?.avatar,
          );
    if (
      input.avatarPresetId !== undefined &&
      !isValidAvatarPresetId(
        String(input.avatarPresetId).trim().toLowerCase(),
      )
    ) {
      throw new HttpError(
        400,
        "Choose one of the 60 official Strategic Souls avatar presets.",
      );
    }

    await db.batch([
      db
        .prepare("UPDATE accounts SET alias = ?, last_active = ? WHERE subject = ?")
        .bind(displayName, now, subject),
      db
        .prepare("UPDATE auth_users SET display_name = ?, updated_at = ? WHERE id = ?")
        .bind(displayName, now, subject),
    ]);

    if (rawHandle || existingBody) {
      const targetHandle = rawHandle ?? existingBody!.handle;
      const targetBio = bio ?? existingBody?.bio ?? "";
      try {
        await db
          .prepare(
            `INSERT INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(subject) DO UPDATE SET
               handle = excluded.handle,
               display_name = excluded.display_name,
               bio = excluded.bio,
               avatar = excluded.avatar,
               updated_at = excluded.updated_at`,
          )
          .bind(
            subject,
            targetHandle,
            displayName,
            targetBio,
            currentAvatarId,
            now,
            now,
          )
          .run();
      } catch (err) {
        if (
          /UNIQUE constraint failed: x1_bodies\.handle|x1_body_handle_unique/i.test(
            String(err),
          )
        ) {
          throw new HttpError(
            409,
            "That @handle is already taken by another researcher. Choose a different handle.",
          );
        }
        throw err;
      }

      // New Body ID creation defaults to a public discoverable researcher profile without altering legacy users' explicit choices.
      if (!existingBody && rawHandle) {
        try {
          await db
            .prepare(
              `INSERT OR IGNORE INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at)
               VALUES (?, 1, 'REQUESTS', 0, 1, ?)`,
            )
            .bind(subject, now)
            .run();
        } catch {
          /* Optional in X1-only fixtures. */
        }
      }

      // If handle changed on an existing Body, keep Web Soul & comment author_handle references synchronized.
      if (existingBody && existingBody.handle !== targetHandle) {
        await Promise.all([
          db
            .prepare(
              "UPDATE x51_web_souls SET author_handle = ? WHERE author_subject = ?",
            )
            .bind(targetHandle, subject)
            .run()
            .catch(() => {}),
          db
            .prepare(
              "UPDATE x51_web_soul_comments SET author_handle = ? WHERE author_subject = ?",
            )
            .bind(targetHandle, subject)
            .run()
            .catch(() => {}),
        ]);
      }
    }

    const nextBannerId =
      input.bannerPresetId !== undefined
        ? isValidBannerPresetId(input.bannerPresetId)
          ? input.bannerPresetId.trim().toLowerCase()
          : (() => {
              throw new HttpError(
                400,
                "Choose a supported Strategic Souls banner preset (b01–b30).",
              );
            })()
        : existingRecord?.bannerPresetId ?? DEFAULT_BANNER_ID;

    const nextBannerPos =
      input.bannerPosition !== undefined
        ? parseBannerPosition(input.bannerPosition)
        : existingRecord?.bannerPosition ?? "center";

    const nextBannerOverlay =
      typeof input.bannerOverlay === "number" &&
      Number.isFinite(input.bannerOverlay)
        ? Math.max(0.35, Math.min(0.92, input.bannerOverlay))
        : existingRecord?.bannerOverlay ?? 0.65;

    const nextAge =
      input.age !== undefined ? parseAge(input.age) : existingRecord?.age ?? null;
    const nextShowAge =
      typeof input.showAge === "boolean"
        ? input.showAge
        : existingRecord?.showAge === true;

    const nextGenderSymbol =
      input.genderSymbol !== undefined
        ? parseGenderSymbol(input.genderSymbol)
        : existingRecord?.genderSymbol ?? "HIDDEN";

    const nextInstagram =
      input.instagramHandle !== undefined
        ? sanitizeInstagram(input.instagramHandle)
        : existingRecord?.instagramHandle ?? "";

    const nextWebsite =
      input.websiteUrl !== undefined
        ? sanitizeWebsite(input.websiteUrl)
        : existingRecord?.websiteUrl ?? "";

    const nextInterests =
      input.researchInterests !== undefined
        ? sanitizeInterests(input.researchInterests)
        : existingRecord?.researchInterests ?? [];

    let nextStateCode: string | null = existingRecord?.stateCode ?? null;
    if (input.stateCode !== undefined) {
      try {
        nextStateCode = parseIndianStateCode(input.stateCode);
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error
            ? err.message
            : "Choose a valid Indian State or Union Territory, or select 'Prefer not to show'.",
        );
      }
    }

    await Promise.all([
      db
        .prepare("UPDATE auth_users SET avatar_id = ?, updated_at = ? WHERE id = ?")
        .bind(currentAvatarId, now, subject)
        .run()
        .catch(() => {}),
      db
        .prepare(
          `INSERT INTO x56_profile_metadata (subject, state_code, banner_id, banner_align, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(subject) DO UPDATE SET
             state_code = excluded.state_code,
             banner_id = excluded.banner_id,
             banner_align = excluded.banner_align,
             updated_at = excluded.updated_at`,
        )
        .bind(subject, nextStateCode, nextBannerId, nextBannerPos, now)
        .run()
        .catch(() => {}),
    ]);

    await upsertStoredProfileRecord(subject, {
      ...(existingRecord ?? {
        avatarKind: "preset",
        avatarPresetId: currentAvatarId,
        preferences: { ...DEFAULT_UI_PREFERENCES },
        updatedAt: now,
      }),
      avatarKind: "preset",
      avatarPresetId: currentAvatarId,
      bannerPresetId: nextBannerId,
      bannerPosition: nextBannerPos,
      bannerOverlay: nextBannerOverlay,
      stateCode: nextStateCode,
      age: nextAge,
      showAge: nextShowAge,
      genderSymbol: nextGenderSymbol,
      instagramHandle: nextInstagram,
      websiteUrl: nextWebsite,
      researchInterests: nextInterests,
      updatedAt: now,
    });

    return getPrivateProfile({ ...user, displayName });
  }

  if (action === "update-preferences") {
    const nextPrefs = parsePreferences({
      ...(existingRecord?.preferences ?? DEFAULT_UI_PREFERENCES),
      ...(typeof input.motion === "string" ? { motion: input.motion } : {}),
      ...(typeof input.density === "string" ? { density: input.density } : {}),
      ...(typeof input.earthQuality === "string"
        ? { earthQuality: input.earthQuality }
        : {}),
      ...(typeof input.privateTickerEnabled === "boolean"
        ? { privateTickerEnabled: input.privateTickerEnabled }
        : {}),
      ...(typeof input.privateTickerMode === "string"
        ? { privateTickerMode: input.privateTickerMode }
        : {}),
    });

    const nextPortfolioBackdrop =
      input.portfolioBackdrop !== undefined
        ? parsePortfolioBackdrop(input.portfolioBackdrop)
        : existingRecord?.portfolioBackdrop ?? { ...DEFAULT_PORTFOLIO_BACKDROP };

    const nextAudience =
      input.defaultPostAudience === "PUBLIC" ||
      input.defaultPostAudience === "FOLLOWERS" ||
      input.defaultPostAudience === "GROUP"
        ? input.defaultPostAudience
        : existingRecord?.defaultPostAudience ?? "PUBLIC";

    const currentPrefAvatarId = await resolveOrBackfillAvatarId(
      subject,
      existingRecord?.avatarPresetId,
      null,
    );

    await upsertStoredProfileRecord(subject, {
      ...(existingRecord ?? {
        avatarKind: "preset",
        avatarPresetId: currentPrefAvatarId,
        preferences: nextPrefs,
        updatedAt: now,
      }),
      avatarKind: "preset",
      avatarPresetId: currentPrefAvatarId,
      portfolioBackdrop: nextPortfolioBackdrop,
      defaultPostAudience: nextAudience,
      preferences: nextPrefs,
      updatedAt: now,
    });

    // If social privacy/notification settings were sent and user has an x1_bodies row, persist them in x2_social_preferences.
    if (
      input.social &&
      typeof input.social === "object" &&
      !Array.isArray(input.social)
    ) {
      const bodyExists = await db
        .prepare("SELECT 1 AS ok FROM x1_bodies WHERE subject = ?")
        .bind(subject)
        .first<{ ok: number }>();
      if (bodyExists) {
        const s = input.social as Record<string, unknown>;
        const currentSocial = await db
          .prepare(
            "SELECT discoverable, messages, receipts, notifications FROM x2_social_preferences WHERE subject = ?",
          )
          .bind(subject)
          .first<{
            discoverable: number;
            messages: string;
            receipts: number;
            notifications: number;
          }>();
        const discoverable =
          typeof s.discoverable === "boolean"
            ? s.discoverable
            : !!(currentSocial?.discoverable ?? 0);
        const receipts =
          typeof s.receipts === "boolean"
            ? s.receipts
            : !!(currentSocial?.receipts ?? 0);
        const notifications =
          typeof s.notifications === "boolean"
            ? s.notifications
            : !!(currentSocial?.notifications ?? 1);
        const messages =
          s.messages === "REQUESTS" ||
          s.messages === "GROUPS" ||
          s.messages === "NONE"
            ? s.messages
            : currentSocial?.messages ?? "REQUESTS";
        await db
          .prepare(
            `INSERT INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(subject) DO UPDATE SET
               discoverable = excluded.discoverable,
               messages = excluded.messages,
               receipts = excluded.receipts,
               notifications = excluded.notifications,
               updated_at = excluded.updated_at`,
          )
          .bind(
            subject,
            discoverable ? 1 : 0,
            messages,
            receipts ? 1 : 0,
            notifications ? 1 : 0,
            now,
          )
          .run();
      }
    }

    return getPrivateProfile(user);
  }

  if (action === "mark-notifications-read") {
    await db.batch([
      db
        .prepare(
          "UPDATE x2_notifications SET read_at = COALESCE(read_at, ?) WHERE subject = ?",
        )
        .bind(now, subject),
      db
        .prepare(
          "UPDATE x1_account_notices SET read_at = COALESCE(read_at, ?) WHERE subject = ?",
        )
        .bind(now, subject),
    ]);
    return getPrivateProfile(user);
  }

  throw new HttpError(400, "Unsupported profile settings action.");
}
