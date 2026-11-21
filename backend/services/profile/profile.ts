import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { bodyHandle, field } from "../community/community-model";
import {
  DEFAULT_AVATAR_ID,
  isValidAvatarPresetId,
  normalizeAvatarId,
} from "./avatars";

const CONSENT_VERSION = "2026-11-14-v4";
const PROFILE_RECORD_KIND = "account-profile";

export type MotionPreference = "system" | "minimal" | "full";
export type DensityPreference = "comfortable" | "compact";
export type EarthQualityPreference = "auto" | "balanced" | "reduced";

export type UiPreferences = {
  motion: MotionPreference;
  density: DensityPreference;
  earthQuality: EarthQualityPreference;
};

export type StoredProfileRecord = {
  avatarKind: "preset";
  avatarPresetId: string;
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
  hasCommunityProfile: boolean;
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

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  motion: "system",
  density: "comfortable",
  earthQuality: "auto",
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
  return { motion, density, earthQuality };
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

/** Fast summary used by /api/auth/session so top-right header renders real persisted avatar immediately. */
export async function getSessionProfileMeta(subject: string): Promise<{
  avatarId: string;
  handle: string | null;
  bio: string;
  discoverable: boolean;
  unreadNotifications: number;
  preferences: UiPreferences;
}> {
  const db = database();
  const [bodyRow, stored, prefsRow, unreadRow] = await Promise.all([
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
        "SELECT count(*) AS count FROM x2_notifications WHERE subject = ? AND read_at IS NULL",
      )
      .bind(subject)
      .first<{ count: number }>()
      .catch(() => null),
  ]);

  // Prefer the dedicated account-profile preset when saved; fall back to x1_bodies.avatar, then default a01.
  const rawAvatar =
    stored?.avatarPresetId ?? bodyRow?.avatar ?? DEFAULT_AVATAR_ID;

  return {
    avatarId: normalizeAvatarId(rawAvatar),
    handle: bodyRow?.handle ?? null,
    bio: bodyRow?.bio ?? "",
    discoverable: !!prefsRow?.discoverable,
    unreadNotifications: Number(unreadRow?.count ?? 0),
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
  const [acc, bodyRow, stored, socialRow, notificationsRes, blockedRes] =
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
          "SELECT id, kind, target_id AS targetId, created_at AS createdAt, read_at AS readAt FROM x2_notifications WHERE subject = ? ORDER BY created_at DESC, id DESC LIMIT 30",
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
    ]);

  const notifications = notificationsRes.results ?? [];
  const unreadNotifications = notifications.filter((n) => !n.readAt).length;
  const avatarId = normalizeAvatarId(
    stored?.avatarPresetId ?? bodyRow?.avatar ?? DEFAULT_AVATAR_ID,
  );
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
    hasCommunityProfile: !!bodyRow,
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
        "Choose one of the 50 official Strategic Souls avatar presets (a01–e10).",
      );
    }

    const nextRecord: StoredProfileRecord = {
      avatarKind: "preset",
      avatarPresetId: rawId,
      preferences: existingRecord?.preferences ?? { ...DEFAULT_UI_PREFERENCES },
      updatedAt: now,
    };

    await upsertStoredProfileRecord(subject, nextRecord);

    // Keep Community x1_bodies.avatar synchronized if the user already has a Community profile
    await db
      .prepare(
        "UPDATE x1_bodies SET avatar = ?, updated_at = ? WHERE subject = ?",
      )
      .bind(rawId, now, subject)
      .run();

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

    const currentAvatarId = normalizeAvatarId(
      input.avatarPresetId ??
        existingRecord?.avatarPresetId ??
        existingBody?.avatar ??
        DEFAULT_AVATAR_ID,
    );
    if (
      input.avatarPresetId !== undefined &&
      !isValidAvatarPresetId(
        String(input.avatarPresetId).trim().toLowerCase(),
      )
    ) {
      throw new HttpError(
        400,
        "Choose one of the 50 official Strategic Souls avatar presets.",
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
    }

    await upsertStoredProfileRecord(subject, {
      avatarKind: "preset",
      avatarPresetId: currentAvatarId,
      preferences: existingRecord?.preferences ?? { ...DEFAULT_UI_PREFERENCES },
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
    });

    await upsertStoredProfileRecord(subject, {
      avatarKind: "preset",
      avatarPresetId: existingRecord?.avatarPresetId ?? DEFAULT_AVATAR_ID,
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
    await db
      .prepare(
        "UPDATE x2_notifications SET read_at = COALESCE(read_at, ?) WHERE subject = ?",
      )
      .bind(now, subject)
      .run();
    return getPrivateProfile(user);
  }

  throw new HttpError(400, "Unsupported profile settings action.");
}
