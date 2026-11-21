/**
 * Strategic Souls X5.1 — Community Research Network Service:
 * - Web discovery feed of authorized published Souls (PUBLIC / FOLLOWERS / GROUP)
 * - One-Click Post Soul from immutable completed scans with source-rights redaction & idempotency
 * - Save, Discuss (comments), Make a Copy (private draft with attribution), Pin (<=3), Delete
 * - Real Follower / Follow-Request graph (x51_follows) with notifications
 * - Body ID public profile lookup (never leaks email, broker creds, or private portfolio values)
 */
import { account, database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import { bodyHandle, field, id } from "./community-model";
import {
  DEFAULT_BANNER_ID,
  resolveBannerPreset,
} from "../profile/banners";
import { normalizeAvatarId } from "../profile/avatars";

const CONSENT_VERSION = "2026-11-14-v4";

export type PostAudience = "PUBLIC" | "FOLLOWERS" | "GROUP";

export type PublishedSoulCard = {
  id: string;
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarId: string;
  authorGenderSymbol: "MALE" | "FEMALE" | "HIDDEN";
  scanId: string;
  soulVersion: number;
  mode: "CLASSIC" | "ADVANCED";
  title: string;
  summary: string;
  formula: string;
  timeframe: string;
  universeLabel: string;
  matchedSymbols: string[];
  evidenceStatus: string;
  sourceAttribution: string;
  riskNote: string;
  audience: PostAudience;
  groupId: string | null;
  pinned: boolean;
  sourceDigest: string;
  copiedFromPostId: string | null;
  copiedFromHandle: string | null;
  createdAt: string;
  saveCount: number;
  commentCount: number;
  savedByMe: boolean;
  isMine: boolean;
};

const nowIso = () => new Date().toISOString();

function requestKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{12,80}$/.test(value)) {
    throw new HttpError(400, "A stable idempotency request ID is required.");
  }
  return value;
}

async function isBlocked(a: string, b: string): Promise<boolean> {
  const row = await database()
    .prepare(
      "SELECT 1 AS yes FROM x2_blocks WHERE (subject=? AND target=?) OR (subject=? AND target=?)",
    )
    .bind(a, b, b, a)
    .first<{ yes: number }>();
  return !!row;
}

async function requireBodyForNetwork(subject: string) {
  const db = database();
  const [bodyRow, acc] = await Promise.all([
    db
      .prepare(
        "SELECT subject, handle, display_name, bio, avatar FROM x1_bodies WHERE subject=?",
      )
      .bind(subject)
      .first<{
        subject: string;
        handle: string;
        display_name: string;
        bio: string;
        avatar: string;
      }>(),
    account(subject),
  ]);
  if (
    !acc ||
    acc.adult_confirmed !== 1 ||
    acc.consent_version !== CONSENT_VERSION
  ) {
    throw new HttpError(
      403,
      "Confirm adult research, privacy, and terms notices before using Community features.",
    );
  }
  if (!bodyRow) {
    throw new HttpError(
      403,
      "Set your unique Body ID (@handle) in Profile before posting or following.",
    );
  }
  return bodyRow;
}

async function pushNotification(
  targetSubject: string,
  kind: string,
  targetId: string,
  eventKey: string,
): Promise<void> {
  await database()
    .prepare(
      `INSERT OR IGNORE INTO x2_notifications (id, subject, kind, target_id, event_key, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE COALESCE((SELECT notifications FROM x2_social_preferences WHERE subject=?), 1) = 1`,
    )
    .bind(
      crypto.randomUUID(),
      targetSubject,
      kind,
      targetId,
      eventKey,
      nowIso(),
      targetSubject,
    )
    .run()
    .catch(() => {
      /* Notification delivery is best-effort. */
    });
}

async function readExtendedProfileMeta(subject: string): Promise<{
  genderSymbol: "MALE" | "FEMALE" | "HIDDEN";
  bannerPresetId: string;
  bannerPosition: "top" | "center" | "bottom";
  bannerOverlay: number;
  instagramHandle: string;
  websiteUrl: string;
  researchInterests: string[];
}> {
  try {
    const row = await database()
      .prepare(
        "SELECT payload FROM x1_records WHERE subject=? AND kind='account-profile' AND archived=0 ORDER BY updated_at DESC LIMIT 1",
      )
      .bind(subject)
      .first<{ payload: string }>();
    if (!row) {
      return {
        genderSymbol: "HIDDEN",
        bannerPresetId: DEFAULT_BANNER_ID,
        bannerPosition: "center",
        bannerOverlay: 0.65,
        instagramHandle: "",
        websiteUrl: "",
        researchInterests: [],
      };
    }
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const gs =
      p.genderSymbol === "MALE" || p.genderSymbol === "FEMALE"
        ? p.genderSymbol
        : "HIDDEN";
    const bp =
      p.bannerPosition === "top" || p.bannerPosition === "bottom"
        ? p.bannerPosition
        : "center";
    const bo =
      typeof p.bannerOverlay === "number" && Number.isFinite(p.bannerOverlay)
        ? Math.max(0.35, Math.min(0.92, p.bannerOverlay))
        : 0.65;
    return {
      genderSymbol: gs,
      bannerPresetId: resolveBannerPreset(
        typeof p.bannerPresetId === "string" ? p.bannerPresetId : null,
      ).id,
      bannerPosition: bp,
      bannerOverlay: bo,
      instagramHandle:
        typeof p.instagramHandle === "string" ? p.instagramHandle : "",
      websiteUrl: typeof p.websiteUrl === "string" ? p.websiteUrl : "",
      researchInterests: Array.isArray(p.researchInterests)
        ? p.researchInterests.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [],
    };
  } catch {
    return {
      genderSymbol: "HIDDEN",
      bannerPresetId: DEFAULT_BANNER_ID,
      bannerPosition: "center",
      bannerOverlay: 0.65,
      instagramHandle: "",
      websiteUrl: "",
      researchInterests: [],
    };
  }
}

export async function getSocialCounts(subject: string): Promise<{
  followers: number;
  following: number;
  publishedSouls: number;
}> {
  const db = database();
  try {
    const [f1, f2, s1] = await Promise.all([
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
      followers: Number(f1?.n ?? 0),
      following: Number(f2?.n ?? 0),
      publishedSouls: Number(s1?.n ?? 0),
    };
  } catch {
    return { followers: 0, following: 0, publishedSouls: 0 };
  }
}

/**
 * Inspects a stored scan payload to determine whether publishing to Web/Followers/Group
 * is permitted and constructs a strictly redacted share-safe summary.
 * - Blocks raw private broker quote redistribution (ANGELONE_SMARTAPI).
 * - Strips raw private CSV OHLCV price rows and non-display licensed payloads.
 */
export function buildShareSafeSoulSummary(
  scan: {
    id: string;
    name: string;
    mode: string;
    digest: string;
    created_at: string;
    payload: Record<string, unknown>;
  },
  audience: PostAudience,
): {
  allowed: boolean;
  blockReason: string | null;
  mode: "CLASSIC" | "ADVANCED";
  formula: string;
  timeframe: string;
  universeLabel: string;
  matchedSymbols: string[];
  evidenceStatus: string;
  sourceAttribution: string;
  riskNote: string;
  blueprintJson: string;
} {
  const payload = scan.payload;
  const sourceStr = String(payload.source ?? "Official reference source");
  const lineage = Array.isArray(payload.sourceLineage)
    ? (payload.sourceLineage as Record<string, unknown>[])
    : [];

  // Hard gate: owner-only retail broker prices (Angel One SmartAPI) cannot be redistributed publicly on Web
  const usesPrivateBroker =
    /angel\s*one|angelone|smartapi/i.test(sourceStr) ||
    lineage.some((l) => /angel\s*one|angelone|smartapi/i.test(String(l.provider ?? "")));

  const hasNonDisplayLineage = lineage.some(
    (l) => l.displayAllowed === false || l.derivedDisplayAllowed === false,
  );

  if (usesPrivateBroker && audience === "PUBLIC") {
    return {
      allowed: false,
      blockReason:
        "This scan used owner-only retail broker market data (Angel One SmartAPI), which cannot be publicly redistributed on Web. Run on official reference data or private CSV methodology to share publicly.",
      mode: "CLASSIC",
      formula: "",
      timeframe: "1d",
      universeLabel: "",
      matchedSymbols: [],
      evidenceStatus: "RESTRICTED",
      sourceAttribution: sourceStr,
      riskNote: "",
      blueprintJson: "{}",
    };
  }

  if (hasNonDisplayLineage) {
    return {
      allowed: false,
      blockReason:
        "Source data rights restrict derived-display redistribution for this scan. It stays strictly private to your Graveyard.",
      mode: "CLASSIC",
      formula: "",
      timeframe: "1d",
      universeLabel: "",
      matchedSymbols: [],
      evidenceStatus: "RESTRICTED",
      sourceAttribution: sourceStr,
      riskNote: "",
      blueprintJson: "{}",
    };
  }

  const research = (payload.research ?? {}) as Record<string, unknown>;
  const rule = (payload.rule ?? {}) as Record<string, unknown>;
  const results = (payload.results ?? {}) as {
    results?: { instrumentId: string; status: string }[];
    matches?: number;
    total?: number;
  };

  const isPrivateCsv = /private user csv/i.test(sourceStr);
  // For private CSV, strip raw price rows and CSV: prefix while preserving canonical symbol names only if non-broker
  const matchedSymbols = (results.results ?? [])
    .filter((r) => r.status === "PASS")
    .map((r) => String(r.instrumentId).replace(/^CSV:/, ""))
    .slice(0, 25);

  const scanTier =
    payload.scanTier === "ADVANCED" || scan.mode === "ADVANCED"
      ? "ADVANCED"
      : "CLASSIC";

  const genome = payload.soulGenome as
    | { futurePaths?: { status?: string; sampleSize?: number } }
    | undefined;
  const evidenceStatus =
    genome?.futurePaths?.status === "CALIBRATED_EMPIRICAL"
      ? `Empirical Twins (n=${genome.futurePaths.sampleSize})`
      : "Current Filter · Uncalibrated";

  const timeframe = String(research.interval ?? "1d");
  const universeLabel = isPrivateCsv
    ? "User-Supplied Private CSV (raw rows redacted)"
    : String(research.universe ?? "ECB_DAILY") === "ECB_DAILY"
      ? "Official ECB Daily FX"
      : "Connected Universe";

  const formula = String(rule.formula ?? research.formula ?? "");
  const blueprintSafe = {
    scanId: scan.id,
    scanCreatedAt: scan.created_at,
    mode: scanTier,
    formula,
    timeframe,
    universeLabel,
    matchedCount: matchedSymbols.length,
    evaluatedCount: results.total ?? matchedSymbols.length,
    sourceAttribution: isPrivateCsv
      ? "Private User CSV Methodology (raw dataset never shared)"
      : sourceStr,
  };

  return {
    allowed: true,
    blockReason: null,
    mode: scanTier,
    formula,
    timeframe,
    universeLabel,
    matchedSymbols,
    evidenceStatus,
    sourceAttribution: blueprintSafe.sourceAttribution,
    riskNote:
      "Educational research snapshot only — not investment advice or guaranteed performance. Private holdings and raw private datasets are stripped.",
    blueprintJson: JSON.stringify(blueprintSafe),
  };
}

export async function publishSoulFromScan(
  subject: string,
  input: Record<string, unknown>,
): Promise<{ postId: string; replayed: boolean; audience: PostAudience }> {
  await rate(subject + ":x51-publish-soul", 20, 60_000);
  const bodyRow = await requireBodyForNetwork(subject);
  const scanId = id(input.scanId, "Scan");
  const key = requestKey(input.idempotencyKey ?? input.requestId);
  const rawAudience = String(input.audience ?? "PUBLIC").toUpperCase();
  if (!["PUBLIC", "FOLLOWERS", "GROUP"].includes(rawAudience)) {
    throw new HttpError(400, "Choose Public, Followers, or Group audience.");
  }
  const audience = rawAudience as PostAudience;
  let groupId: string | null = null;
  if (audience === "GROUP") {
    groupId = id(input.groupId, "Group");
    const membership = await database()
      .prepare("SELECT role FROM x1_memberships WHERE group_id=? AND subject=?")
      .bind(groupId, subject)
      .first<{ role: string }>();
    if (!membership) {
      throw new HttpError(403, "You must be a member of that group to publish to it.");
    }
  }

  const db = database();
  // Idempotency check
  const existing = await db
    .prepare(
      "SELECT id, scan_id, audience FROM x51_web_souls WHERE author_subject=? AND idempotency_key=?",
    )
    .bind(subject, key)
    .first<{ id: string; scan_id: string; audience: PostAudience }>();
  if (existing) {
    if (existing.scan_id !== scanId) {
      throw new HttpError(
        409,
        "Idempotency key already used for a different scan.",
      );
    }
    return { postId: existing.id, replayed: true, audience: existing.audience };
  }

  // Verify caller owns the immutable scan record
  const scanRow = await db
    .prepare(
      "SELECT id, name, mode, payload, digest, created_at FROM x1_scans WHERE id=? AND subject=?",
    )
    .bind(scanId, subject)
    .first<{
      id: string;
      name: string;
      mode: string;
      payload: string;
      digest: string;
      created_at: string;
    }>();
  if (!scanRow) {
    throw new HttpError(404, "Completed scan not found in your Graveyard.");
  }

  const parsedPayload = JSON.parse(scanRow.payload) as Record<string, unknown>;
  const safe = buildShareSafeSoulSummary(
    { ...scanRow, payload: parsedPayload },
    audience,
  );
  if (!safe.allowed) {
    throw new HttpError(403, safe.blockReason || "Source data rights forbid sharing.");
  }

  const title =
    typeof input.title === "string" && input.title.trim()
      ? field(input.title, "Title", 100, 3)
      : scanRow.name.slice(0, 100);
  const summary =
    typeof input.summary === "string" && input.summary.trim()
      ? field(input.summary, "Summary", 400, 1)
      : String(parsedPayload.description ?? `Published ${safe.mode} Soul Scan on ${safe.timeframe}.`).slice(
          0,
          400,
        );

  const postId = crypto.randomUUID();
  const createdAt = nowIso();

  await db
    .prepare(
      `INSERT OR IGNORE INTO x51_web_souls (
         id, author_subject, author_handle, scan_id, soul_version, mode, title, summary,
         formula, blueprint_json, timeframe, universe_label, matched_symbols_json,
         evidence_status, source_attribution, risk_note, audience, group_id,
         idempotency_key, pinned, source_digest, copied_from_post_id, copied_from_handle,
         created_at, deleted_at
       ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, NULL)`,
    )
    .bind(
      postId,
      subject,
      bodyRow.handle,
      scanRow.id,
      safe.mode,
      title,
      summary,
      safe.formula,
      safe.blueprintJson,
      safe.timeframe,
      safe.universeLabel,
      JSON.stringify(safe.matchedSymbols),
      safe.evidenceStatus,
      safe.sourceAttribution,
      safe.riskNote,
      audience,
      groupId,
      key,
      scanRow.digest,
      createdAt,
    )
    .run();

  const saved = await db
    .prepare(
      "SELECT id, audience FROM x51_web_souls WHERE author_subject=? AND idempotency_key=?",
    )
    .bind(subject, key)
    .first<{ id: string; audience: PostAudience }>();
  if (!saved) {
    throw new HttpError(503, "Publish could not be confirmed; retry safely.");
  }

  return { postId: saved.id, replayed: false, audience: saved.audience };
}

export async function listWebSouls(
  viewerSubject: string | null,
  options: {
    mode?: string;
    timeframe?: string;
    symbol?: string;
    search?: string;
    sort?: "newest" | "following" | "evidence";
    authorHandle?: string;
    savedOnly?: boolean;
  } = {},
): Promise<{ posts: PublishedSoulCard[] }> {
  const db = database();
  const viewer = viewerSubject ?? "__guest__";

  // Server-enforced visibility query:
  // PUBLIC visible to all non-blocked viewers;
  // FOLLOWERS visible to author + active followers;
  // GROUP visible to author + active group members.
  const rows = await db
    .prepare(
      `SELECT
         p.*,
         b.display_name AS author_display_name,
         b.avatar AS author_avatar,
         (SELECT count(*) FROM x51_web_soul_saves s WHERE s.post_id = p.id) AS save_count,
         (SELECT count(*) FROM x51_web_soul_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
         EXISTS(SELECT 1 FROM x51_web_soul_saves s WHERE s.post_id = p.id AND s.subject = ?) AS saved_by_me,
         EXISTS(SELECT 1 FROM x51_follows f WHERE f.follower_subject = ? AND f.target_subject = p.author_subject AND f.state = 'ACTIVE') AS following_author
       FROM x51_web_souls p
       JOIN x1_bodies b ON b.subject = p.author_subject
       WHERE p.deleted_at IS NULL
         AND (
           p.author_subject = ?
           OR p.audience = 'PUBLIC'
           OR (p.audience = 'FOLLOWERS' AND EXISTS(SELECT 1 FROM x51_follows f WHERE f.follower_subject = ? AND f.target_subject = p.author_subject AND f.state = 'ACTIVE'))
           OR (p.audience = 'GROUP' AND p.group_id IS NOT NULL AND EXISTS(SELECT 1 FROM x1_memberships m WHERE m.group_id = p.group_id AND m.subject = ?))
         )
         AND NOT EXISTS (
           SELECT 1 FROM x2_blocks z
           WHERE (z.subject = ? AND z.target = p.author_subject)
              OR (z.subject = p.author_subject AND z.target = ?)
         )
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 80`,
    )
    .bind(viewer, viewer, viewer, viewer, viewer, viewer, viewer)
    .all<
      Record<string, unknown> & {
        id: string;
        author_subject: string;
        author_handle: string;
        author_display_name: string;
        author_avatar: string;
        scan_id: string;
        soul_version: number;
        mode: string;
        title: string;
        summary: string;
        formula: string;
        timeframe: string;
        universe_label: string;
        matched_symbols_json: string;
        evidence_status: string;
        source_attribution: string;
        risk_note: string;
        audience: PostAudience;
        group_id: string | null;
        pinned: number;
        source_digest: string;
        copied_from_post_id: string | null;
        copied_from_handle: string | null;
        created_at: string;
        save_count: number;
        comment_count: number;
        saved_by_me: number;
        following_author: number;
      }
    >();

  const metaCache = new Map<string, "MALE" | "FEMALE" | "HIDDEN">();
  const modeQ = (options.mode ?? "ALL").toUpperCase();
  const tfQ = (options.timeframe ?? "ALL").toLowerCase();
  const symQ = (options.symbol ?? "").trim().toUpperCase();
  const searchQ = (options.search ?? "").trim().toLowerCase();
  const authorQ = (options.authorHandle ?? "").trim().replace(/^@/, "").toLowerCase();

  let items: (PublishedSoulCard & { _following: boolean })[] = [];

  for (const r of rows.results ?? []) {
    if (options.savedOnly && !r.saved_by_me) continue;
    if (modeQ !== "ALL" && r.mode.toUpperCase() !== modeQ) continue;
    if (tfQ !== "all" && r.timeframe.toLowerCase() !== tfQ) continue;
    if (authorQ && r.author_handle.toLowerCase() !== authorQ) continue;

    let matchedSymbols: string[] = [];
    try {
      const parsed = JSON.parse(r.matched_symbols_json);
      if (Array.isArray(parsed)) matchedSymbols = parsed.map(String);
    } catch {
      matchedSymbols = [];
    }

    if (symQ) {
      const symShort = symQ.includes(":") ? symQ.split(":")[1] : symQ;
      const matchesSym =
        matchedSymbols.some(
          (s) => s.toUpperCase() === symQ || s.toUpperCase().endsWith(":" + symShort),
        ) || r.title.toUpperCase().includes(symShort);
      if (!matchesSym) continue;
    }

    if (searchQ) {
      const hay = `${r.title} ${r.summary} ${r.formula} ${r.author_handle} ${matchedSymbols.join(" ")}`.toLowerCase();
      if (!hay.includes(searchQ)) continue;
    }

    let gs = metaCache.get(r.author_subject);
    if (!gs) {
      gs = (await readExtendedProfileMeta(r.author_subject)).genderSymbol;
      metaCache.set(r.author_subject, gs);
    }

    items.push({
      id: r.id,
      authorHandle: r.author_handle,
      authorDisplayName: r.author_display_name,
      authorAvatarId: normalizeAvatarId(r.author_avatar),
      authorGenderSymbol: gs,
      scanId: r.scan_id,
      soulVersion: r.soul_version,
      mode: r.mode === "ADVANCED" ? "ADVANCED" : "CLASSIC",
      title: r.title,
      summary: r.summary,
      formula: r.formula,
      timeframe: r.timeframe,
      universeLabel: r.universe_label,
      matchedSymbols,
      evidenceStatus: r.evidence_status,
      sourceAttribution: r.source_attribution,
      riskNote: r.risk_note,
      audience: r.audience,
      groupId: r.group_id,
      pinned: !!r.pinned,
      sourceDigest: r.source_digest,
      copiedFromPostId: r.copied_from_post_id,
      copiedFromHandle: r.copied_from_handle,
      createdAt: r.created_at,
      saveCount: Number(r.save_count ?? 0),
      commentCount: Number(r.comment_count ?? 0),
      savedByMe: !!r.saved_by_me,
      isMine: r.author_subject === viewerSubject,
      _following: !!r.following_author,
    });
  }

  if (options.sort === "following") {
    items = items.filter((p) => p._following || p.isMine);
  } else if (options.sort === "evidence") {
    items.sort(
      (a, b) =>
        (b.evidenceStatus.startsWith("Empirical") ? 1 : 0) -
          (a.evidenceStatus.startsWith("Empirical") ? 1 : 0) ||
        b.matchedSymbols.length - a.matchedSymbols.length ||
        b.createdAt.localeCompare(a.createdAt),
    );
  }

  return {
    posts: items.map(({ _following: _, ...post }) => post),
  };
}

export async function getPostComments(
  viewerSubject: string | null,
  postId: string,
) {
  const pid = id(postId, "Post");
  const { posts } = await listWebSouls(viewerSubject);
  if (!posts.some((p) => p.id === pid)) {
    throw new HttpError(404, "Published Soul not found or access restricted.");
  }
  const rows = await database()
    .prepare(
      `SELECT c.id, c.post_id AS postId, c.author_handle AS authorHandle, b.avatar AS authorAvatar,
              c.content AS text, c.created_at AS createdAt, (c.author_subject = ?) AS isMine
       FROM x51_web_soul_comments c
       JOIN x1_bodies b ON b.subject = c.author_subject
       WHERE c.post_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT 100`,
    )
    .bind(viewerSubject ?? "__guest__", pid)
    .all<{
      id: string;
      postId: string;
      authorHandle: string;
      authorAvatar: string;
      text: string;
      createdAt: string;
      isMine: number;
    }>();
  return {
    comments: (rows.results ?? []).map((c) => ({
      ...c,
      authorAvatar: normalizeAvatarId(c.authorAvatar),
      isMine: !!c.isMine,
    })),
  };
}

export async function getPublicResearcherProfile(
  viewerSubject: string | null,
  rawHandle: string,
) {
  const handle = bodyHandle(rawHandle);
  const db = database();
  const target = await db
    .prepare(
      "SELECT subject, handle, display_name, bio, avatar FROM x1_bodies WHERE handle=?",
    )
    .bind(handle)
    .first<{
      subject: string;
      handle: string;
      display_name: string;
      bio: string;
      avatar: string;
    }>();
  if (!target) throw new HttpError(404, "Body ID not found.");

  const isMe = viewerSubject === target.subject;
  if (!isMe && viewerSubject && (await isBlocked(viewerSubject, target.subject))) {
    throw new HttpError(404, "Body ID not found.");
  }

  const prefs = await db
    .prepare("SELECT discoverable, messages FROM x2_social_preferences WHERE subject=?")
    .bind(target.subject)
    .first<{ discoverable: number; messages: string }>();

  const discoverable = !!prefs?.discoverable;
  let followState: "NONE" | "PENDING" | "ACTIVE" = "NONE";
  if (viewerSubject && !isMe) {
    const f = await db
      .prepare(
        "SELECT state FROM x51_follows WHERE follower_subject=? AND target_subject=?",
      )
      .bind(viewerSubject, target.subject)
      .first<{ state: string }>();
    if (f?.state === "ACTIVE") followState = "ACTIVE";
    else if (f?.state === "PENDING") followState = "PENDING";
  }

  // Non-discoverable profiles can only be opened by self, active followers, or shared group members
  if (!isMe && !discoverable && followState !== "ACTIVE") {
    const sharedGroup = viewerSubject
      ? await db
          .prepare(
            "SELECT 1 FROM x1_memberships a JOIN x1_memberships b ON b.group_id=a.group_id WHERE a.subject=? AND b.subject=? LIMIT 1",
          )
          .bind(viewerSubject, target.subject)
          .first()
      : null;
    if (!sharedGroup) {
      throw new HttpError(404, "Body ID not found or profile is private.");
    }
  }

  const [ext, counts, feed] = await Promise.all([
    readExtendedProfileMeta(target.subject),
    getSocialCounts(target.subject),
    listWebSouls(viewerSubject, { authorHandle: target.handle }),
  ]);

  return {
    profile: {
      handle: target.handle,
      displayName: target.display_name,
      bio: target.bio,
      avatarId: normalizeAvatarId(target.avatar),
      genderSymbol: ext.genderSymbol,
      bannerPresetId: ext.bannerPresetId,
      bannerPosition: ext.bannerPosition,
      bannerOverlay: ext.bannerOverlay,
      instagramHandle: ext.instagramHandle,
      websiteUrl: ext.websiteUrl,
      researchInterests: ext.researchInterests,
      discoverable,
      isMe,
      followState,
      canMessage: !isMe && (prefs?.messages ?? "REQUESTS") !== "NONE",
      counts,
      pinnedSouls: feed.posts.filter((p) => p.pinned).slice(0, 3),
      posts: feed.posts,
      // Explicitly never exposes portfolioValue, email, or private Graveyard
      portfolioValueVisibility: "PRIVATE_HIDDEN",
    },
  };
}

export async function getPendingFollowRequests(subject: string) {
  const rows = await database()
    .prepare(
      `SELECT f.follower_subject AS followerSubject, b.handle, b.display_name AS displayName,
              b.avatar, f.created_at AS createdAt
       FROM x51_follows f
       JOIN x1_bodies b ON b.subject = f.follower_subject
       WHERE f.target_subject = ? AND f.state = 'PENDING'
       ORDER BY f.created_at DESC
       LIMIT 30`,
    )
    .bind(subject)
    .all<{
      followerSubject: string;
      handle: string;
      displayName: string;
      avatar: string;
      createdAt: string;
    }>();
  return (rows.results ?? []).map((r) => ({
    handle: r.handle,
    displayName: r.displayName,
    avatarId: normalizeAvatarId(r.avatar),
    createdAt: r.createdAt,
  }));
}

export async function mutateResearchNetwork(
  subject: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = String(input.action ?? "");
  const db = database();
  const now = nowIso();

  if (action === "publish-soul") {
    return publishSoulFromScan(subject, input);
  }

  await rate(subject + ":x51-network-write", 60, 60_000);
  const bodyRow = await requireBodyForNetwork(subject);

  if (action === "save-soul") {
    const postId = id(input.postId, "Post");
    const active = Boolean(input.active ?? true);
    const { posts } = await listWebSouls(subject);
    if (!posts.some((p) => p.id === postId)) {
      throw new HttpError(404, "Published Soul not found.");
    }
    if (active) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO x51_web_soul_saves (subject, post_id, created_at) VALUES (?, ?, ?)",
        )
        .bind(subject, postId, now)
        .run();
    } else {
      await db
        .prepare("DELETE FROM x51_web_soul_saves WHERE subject=? AND post_id=?")
        .bind(subject, postId)
        .run();
    }
    return { saved: active };
  }

  if (action === "pin-soul") {
    const postId = id(input.postId, "Post");
    const pinned = Boolean(input.pinned ?? true);
    const post = await db
      .prepare(
        "SELECT id, pinned FROM x51_web_souls WHERE id=? AND author_subject=? AND deleted_at IS NULL",
      )
      .bind(postId, subject)
      .first<{ id: string; pinned: number }>();
    if (!post) throw new HttpError(404, "Only the author can pin their published Soul.");
    if (pinned && !post.pinned) {
      const countRow = await db
        .prepare(
          "SELECT count(*) AS n FROM x51_web_souls WHERE author_subject=? AND pinned=1 AND deleted_at IS NULL",
        )
        .bind(subject)
        .first<{ n: number }>();
      if (Number(countRow?.n ?? 0) >= 3) {
        throw new HttpError(400, "Pin at most 3 Souls to your profile.");
      }
    }
    await db
      .prepare("UPDATE x51_web_souls SET pinned=? WHERE id=? AND author_subject=?")
      .bind(pinned ? 1 : 0, postId, subject)
      .run();
    return { pinned };
  }

  if (action === "delete-soul") {
    const postId = id(input.postId, "Post");
    const res = await db
      .prepare(
        "UPDATE x51_web_souls SET deleted_at=?, pinned=0 WHERE id=? AND author_subject=? AND deleted_at IS NULL",
      )
      .bind(now, postId, subject)
      .run();
    if (!res.meta.changes) {
      throw new HttpError(404, "Published Soul not found or not owned by you.");
    }
    return { deleted: true };
  }

  if (action === "comment-soul") {
    const postId = id(input.postId, "Post");
    const text = field(input.text, "Comment", 1000, 1);
    const key = requestKey(input.requestId);
    const { posts } = await listWebSouls(subject);
    const post = posts.find((p) => p.id === postId);
    if (!post) throw new HttpError(404, "Published Soul not found.");

    const authorRow = await db
      .prepare("SELECT author_subject FROM x51_web_souls WHERE id=?")
      .bind(postId)
      .first<{ author_subject: string }>();

    const commentId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT OR IGNORE INTO x51_web_soul_comments
           (id, post_id, author_subject, author_handle, content, request_key, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(commentId, postId, subject, bodyRow.handle, text, key, now)
      .run();

    if (authorRow && authorRow.author_subject !== subject) {
      await pushNotification(
        authorRow.author_subject,
        "SOUL_COMMENT",
        postId,
        `soul-comment:${commentId}`,
      );
    }
    return { commentId };
  }

  if (action === "copy-soul") {
    const postId = id(input.postId, "Post");
    const { posts } = await listWebSouls(subject);
    const post = posts.find((p) => p.id === postId);
    if (!post) throw new HttpError(404, "Published Soul not found or restricted.");

    const draftId = crypto.randomUUID();
    const copyName = `${post.title.slice(0, 74)} (Copy of @${post.authorHandle})`;
    const definition = {
      name: copyName.slice(0, 100),
      description: `Private copy attributed to @${post.authorHandle} (Soul v${post.soulVersion}, original scan ${post.scanId}). Verify independently on your own entitled data.`,
      formula: post.formula,
      mode: post.mode === "ADVANCED" ? "ADVANCED" : "SIMPLE",
      universe: "ECB_DAILY",
      interval: ["30m", "1h", "1d", "1wk", "1mo"].includes(post.timeframe)
        ? post.timeframe
        : "1d",
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: {
        family: "POSITIVE_RETURN",
        horizon: 10,
        threshold: 0,
        target: 5,
        stop: 3,
        costBps: 0,
      },
      instrumentIds: [],
      copiedFrom: {
        postId: post.id,
        authorHandle: post.authorHandle,
        soulVersion: post.soulVersion,
      },
    };
    const payload = JSON.stringify({
      definition,
      copiedFrom: definition.copiedFrom,
      versions: [{ version: 1, savedAt: now, definition }],
    });
    await db
      .prepare(
        `INSERT INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
         SELECT ?, ?, 'scan-draft', ?, ?, 1, 0, ?, ?, ?
         WHERE (SELECT count(*) FROM x1_records WHERE subject=? AND archived=0) < 100`,
      )
      .bind(
        draftId,
        subject,
        definition.name,
        payload,
        crypto.randomUUID(),
        now,
        now,
        subject,
      )
      .run();
    return {
      draftId,
      definition,
      attribution: `Copied privately from @${post.authorHandle} (v${post.soulVersion}).`,
    };
  }

  if (action === "follow") {
    const targetHandle = bodyHandle(input.handle);
    const active = input.active !== false;
    const target = await db
      .prepare("SELECT subject, handle FROM x1_bodies WHERE handle=?")
      .bind(targetHandle)
      .first<{ subject: string; handle: string }>();
    if (!target || target.subject === subject) {
      throw new HttpError(404, "Choose another valid Body ID to follow.");
    }
    if (await isBlocked(subject, target.subject)) {
      throw new HttpError(404, "Body ID not found.");
    }

    if (!active) {
      await db
        .prepare(
          "DELETE FROM x51_follows WHERE follower_subject=? AND target_subject=?",
        )
        .bind(subject, target.subject)
        .run();
      return { state: "NONE" };
    }

    const prefs = await db
      .prepare("SELECT discoverable FROM x2_social_preferences WHERE subject=?")
      .bind(target.subject)
      .first<{ discoverable: number }>();
    const nextState = prefs?.discoverable ? "ACTIVE" : "PENDING";

    await db
      .prepare(
        `INSERT INTO x51_follows (follower_subject, target_subject, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(follower_subject, target_subject) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at`,
      )
      .bind(subject, target.subject, nextState, now, now)
      .run();

    await pushNotification(
      target.subject,
      nextState === "PENDING" ? "FOLLOW_REQUEST" : "NEW_FOLLOWER",
      bodyRow.handle,
      `follow:${subject}:${target.subject}:${nextState}`,
    );

    return { state: nextState };
  }

  if (action === "respond-follow") {
    const followerHandle = bodyHandle(input.handle);
    const decision = String(input.decision ?? "").toUpperCase();
    if (!["APPROVE", "DECLINE"].includes(decision)) {
      throw new HttpError(400, "Choose APPROVE or DECLINE.");
    }
    const follower = await db
      .prepare("SELECT subject FROM x1_bodies WHERE handle=?")
      .bind(followerHandle)
      .first<{ subject: string }>();
    if (!follower) throw new HttpError(404, "Follow request not found.");

    if (decision === "APPROVE") {
      const res = await db
        .prepare(
          "UPDATE x51_follows SET state='ACTIVE', updated_at=? WHERE follower_subject=? AND target_subject=? AND state='PENDING'",
        )
        .bind(now, follower.subject, subject)
        .run();
      if (!res.meta.changes) throw new HttpError(404, "Pending follow request not found.");
      await pushNotification(
        follower.subject,
        "FOLLOW_APPROVED",
        bodyRow.handle,
        `follow-approved:${subject}:${follower.subject}`,
      );
      return { state: "ACTIVE" };
    } else {
      await db
        .prepare(
          "DELETE FROM x51_follows WHERE follower_subject=? AND target_subject=? AND state='PENDING'",
        )
        .bind(follower.subject, subject)
        .run();
      return { state: "DECLINED" };
    }
  }

  throw new HttpError(400, "Unsupported Community network action.");
}
