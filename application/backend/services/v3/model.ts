import { HttpError } from "../../middleware/security";
import { sourceUrl, timestamp } from "../legacy/notebook";

export const PROFILE_LABEL = "Body"; // Presentation only; Buddy needs no migration.
export const MODES = ["Beginner", "Standard", "Advanced"] as const;
export type Mode = (typeof MODES)[number];
export const ROLES = [
  "OWNER",
  "ADMIN",
  "EDITOR",
  "REVIEWER",
  "VIEWER",
] as const;
export type Role = (typeof ROLES)[number];
export const STATES = [
  "DRAFT",
  "ACTIVE",
  "AWAITING_DATA",
  "READY_TO_REVIEW",
  "RESOLVED_SUPPORTED",
  "RESOLVED_INVALIDATED",
  "INCONCLUSIVE",
  "ARCHIVED",
] as const;
export type SoulState = (typeof STATES)[number];
export type Evidence = {
  title: string;
  url: string;
  claim: string;
  stance: "SUPPORTS" | "OPPOSES" | "CONTEXT";
  publishedAt: string;
  knownAt: string;
};
export type SoulPayload = {
  title: string;
  topic: string;
  hypothesis: string;
  horizon: string;
  reasoning: string;
  opposingCase: string;
  invalidation: string;
  reviewAt: string | null;
  tags: string[];
  evidence: Evidence[];
  commitment: "DRAFT" | "COMMITTED";
  dataRequired: boolean;
};
export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_path?: string | null;
  is_public: boolean;
  created_at: string;
  preferences: Record<string, unknown>;
};
export type Soul = {
  id: string;
  owner_id: string;
  team_id: string | null;
  head_id: string;
  created_at: string;
  title: string;
};
export type SoulVersion = {
  id: string;
  soul_id: string;
  parent_id: string | null;
  author_id: string;
  payload: SoulPayload;
  digest: string;
  created_at: string;
};
export type SoulEvent = {
  id: string;
  soul_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  author_id: string;
};
export type Team = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};
export type ScanCondition = {
  field:
    | "close_vs_sma"
    | "rsi"
    | "avg_traded_value"
    | "delivery_pct"
    | "median_turnover"
    | "spread_bps"
    | "impact_bps";
  op: "gt" | "gte" | "lt" | "lte";
  value: number;
  period: number | null;
  unit: "ratio" | "percent" | "INR" | "bps";
};
export type Scan = {
  schema: "scan-v3.1";
  universe: string;
  timeframe: "EOD";
  conditions: ScanCondition[];
  costs: { feeBps: number; slippageBps: number; taxBps: number };
  exit: { holdingBars: number };
  dataSource: string | null;
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "A JSON object is required.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  name: string,
  max = 1000,
  min = 0,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    throw new HttpError(
      400,
      name + " must contain " + min + "–" + max + " characters.",
    );
  return value.trim();
}
export function uuid(value: unknown): string {
  const s = text(value, "Record ID", 36, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    )
  )
    throw new HttpError(400, "Invalid record ID.");
  return s;
}
export function handle(value: unknown): string {
  const s = text(value, "Handle", 64, 3)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^@/, "");
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(s))
    throw new HttpError(
      400,
      "Use 3–24 letters, numbers or underscores, starting with a letter.",
    );
  if (
    [
      "admin",
      "administrator",
      "support",
      "moderator",
      "gvv",
      "strategic_souls",
      "api",
      "root",
      "system",
      "deleted",
      "null",
      "official",
      "sebi",
      "nse",
    ].includes(s)
  )
    throw new HttpError(400, "This handle is reserved.");
  return s;
}
export function validateProfile(value: unknown) {
  const p = object(value);
  return {
    handle: handle(p.handle),
    display_name: text(p.displayName, "Display name", 60, 1),
    bio: text(p.bio ?? "", "Bio", 300),
    is_public: p.isPublic === true,
    preferences: {
      mode: MODES.includes(p.mode as Mode) ? p.mode : "Beginner",
      reviewReminders: p.reviewReminders === true,
      teamNotifications: p.teamNotifications === true,
    },
  };
}
export function validateSoul(
  value: unknown,
  now = new Date().toISOString(),
): SoulPayload {
  const p = object(value),
    committed = p.commitment === "COMMITTED";
  if (!["DRAFT", "COMMITTED"].includes(String(p.commitment)))
    throw new HttpError(400, "Choose draft or committed research.");
  const reviewAt = p.reviewAt ? timestamp(p.reviewAt, "Review date") : null;
  if (
    committed &&
    (!reviewAt ||
      reviewAt <= now ||
      Date.parse(reviewAt) > Date.parse(now) + 5 * 366 * 86400000)
  )
    throw new HttpError(400, "Choose a future review date within five years.");
  if (!Array.isArray(p.evidence) || p.evidence.length > 12)
    throw new HttpError(400, "Use at most twelve evidence links.");
  const evidence = p.evidence.map((v) => {
    const e = object(v),
      publishedAt = timestamp(e.publishedAt, "Published at"),
      knownAt = timestamp(e.knownAt, "Known at");
    if (publishedAt > knownAt || knownAt > now)
      throw new HttpError(
        400,
        "Sources must be published before known-at and cannot be future evidence.",
      );
    if (!["SUPPORTS", "OPPOSES", "CONTEXT"].includes(String(e.stance)))
      throw new HttpError(400, "Choose a source stance.");
    return {
      title: text(e.title, "Source title", 160, 1),
      url: sourceUrl(e.url),
      claim: text(e.claim, "Source interpretation", 600, 1),
      stance: e.stance as Evidence["stance"],
      publishedAt,
      knownAt,
    };
  });
  if (new Set(evidence.map((e) => e.url)).size !== evidence.length)
    throw new HttpError(400, "Duplicate source URL.");
  const tags = Array.isArray(p.tags)
    ? p.tags.map((v) => text(v, "Tag", 30, 1))
    : [];
  if (tags.length > 10) throw new HttpError(400, "Use at most ten tags.");
  return {
    title: text(p.title, "Title", 100, 1),
    topic: text(p.topic ?? "", "Topic", 80, committed ? 1 : 0),
    hypothesis: text(
      p.hypothesis ?? "",
      "Hypothesis",
      2000,
      committed ? 10 : 0,
    ),
    horizon: text(p.horizon ?? "One month", "Horizon", 80, 1),
    reasoning: text(p.reasoning ?? "", "Reasoning", 2000),
    opposingCase: text(
      p.opposingCase ?? "",
      "Opposing case",
      1500,
      committed ? 10 : 0,
    ),
    invalidation: text(
      p.invalidation ?? "",
      "Invalidation criteria",
      1500,
      committed ? 10 : 0,
    ),
    reviewAt,
    tags: [...new Set(tags)],
    evidence,
    commitment: committed ? "COMMITTED" : "DRAFT",
    dataRequired: p.dataRequired === true,
  };
}
export function soulState(
  version: SoulVersion,
  events: SoulEvent[],
  now = new Date().toISOString(),
): SoulState {
  const own = events
    .filter((e) => e.soul_id === version.soul_id)
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  const archive = own
    .filter((e) => ["ARCHIVE", "RESTORE"].includes(e.event_type))
    .at(-1);
  if (archive?.event_type === "ARCHIVE") return "ARCHIVED";
  const review = own
    .filter(
      (e) => e.event_type === "REVIEW" && e.payload.versionId === version.id,
    )
    .at(-1);
  if (
    review &&
    ["RESOLVED_SUPPORTED", "RESOLVED_INVALIDATED", "INCONCLUSIVE"].includes(
      String(review.payload.outcome),
    )
  )
    return review.payload.outcome as SoulState;
  if (version.payload.commitment === "DRAFT") return "DRAFT";
  if (version.payload.reviewAt && version.payload.reviewAt <= now)
    return "READY_TO_REVIEW";
  return version.payload.dataRequired ? "AWAITING_DATA" : "ACTIVE";
}
export type Moderation = {
  version: "guardrails-1";
  decision: "ALLOW_PRIVATE" | "ALLOW_TEAM" | "REVIEW_REQUIRED" | "BLOCK_PUBLIC";
  reasons: { code: string; snippet: string; reason: string }[];
  classifier: "NOT_CONFIGURED";
  notice: string;
};
export function moderate(
  content: string,
  visibility: "PRIVATE" | "TEAM" | "PUBLIC",
): Moderation {
  const checks: [string, RegExp, string][] = [
    [
      "GUARANTEE",
      /\b(guaranteed?|risk[- ]free|sure[- ]shot|100\s*%\s*(profit|return|accurac))/gi,
      "Unverifiable return guarantee.",
    ],
    [
      "PERSONAL_TIP",
      /\b(you (must|should)|for your portfolio).{0,60}\b(buy|sell|invest)\b/gi,
      "Potential personalized financial instruction.",
    ],
    [
      "MANIPULATION",
      /\b(pump and dump|pump this|front[- ]run|insider tip|buy now.{0,30}target)\b/gi,
      "Potential manipulation or promotional trading call.",
    ],
    [
      "PROMOTION",
      /\b(affiliate|paid promotion|referral bonus|join my paid|double your money)\b/gi,
      "Financial promotion or conflict needs review.",
    ],
    [
      "TRACK_RECORD",
      /\b(\d{2,3}%\s*(win rate|accuracy)|verified profits)\b/gi,
      "Performance claim needs independent verification.",
    ],
  ];
  const reasons = checks.flatMap(([code, re, reason]) =>
    [...content.matchAll(re)]
      .slice(0, 3)
      .map((m) => ({ code, snippet: m[0].slice(0, 120), reason })),
  );
  return {
    version: "guardrails-1",
    decision:
      visibility === "PUBLIC"
        ? "BLOCK_PUBLIC"
        : visibility === "PRIVATE"
          ? "ALLOW_PRIVATE"
          : reasons.length
            ? "REVIEW_REQUIRED"
            : "ALLOW_TEAM",
    reasons,
    classifier: "NOT_CONFIGURED",
    notice:
      "Automated rules are screening only. A trained classifier and qualified legal review are not configured. Public publishing remains disabled.",
  };
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            stable((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : stable(value),
  );
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function diff(
  before: unknown,
  after: unknown,
  path = "",
): { path: string; before: unknown; after: unknown }[] {
  if (stable(before) === stable(after)) return [];
  if (Array.isArray(before) && Array.isArray(after))
    return Array.from(
      { length: Math.max(before.length, after.length) },
      (_, i) => i,
    ).flatMap((i) => diff(before[i], after[i], path + "[" + i + "]"));
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((k) =>
        diff(
          (before as Record<string, unknown>)[k],
          (after as Record<string, unknown>)[k],
          path ? path + "." + k : k,
        ),
      );
  }
  return [
    { path: path || "root", before: before ?? null, after: after ?? null },
  ];
}
export const EMPTY_SCAN: Scan = {
  schema: "scan-v3.1",
  universe: "NSE eligible (point-in-time required)",
  timeframe: "EOD",
  conditions: [],
  costs: { feeBps: 0, slippageBps: 0, taxBps: 0 },
  exit: { holdingBars: 5 },
  dataSource: null,
};
export function validateScan(value: unknown): Scan {
  const p = object(value);
  if (
    p.schema !== "scan-v3.1" ||
    p.timeframe !== "EOD" ||
    !Array.isArray(p.conditions) ||
    p.conditions.length < 1 ||
    p.conditions.length > 16
  )
    throw new HttpError(400, "Choose 1–16 EOD conditions.");
  const units: Record<ScanCondition["field"], ScanCondition["unit"]> = {
    close_vs_sma: "ratio",
    rsi: "percent",
    avg_traded_value: "INR",
    delivery_pct: "percent",
    median_turnover: "INR",
    spread_bps: "bps",
    impact_bps: "bps",
  };
  const conditions = p.conditions.map((v) => {
    const c = object(v),
      field = c.field as ScanCondition["field"];
    if (
      !(field in units) ||
      !["gt", "gte", "lt", "lte"].includes(String(c.op)) ||
      typeof c.value !== "number" ||
      !Number.isFinite(c.value) ||
      c.value < 0 ||
      c.unit !== units[field]
    )
      throw new HttpError(400, "Invalid condition, threshold or units.");
    const period = c.period == null ? null : Number(c.period);
    if (
      ["close_vs_sma", "rsi", "avg_traded_value", "median_turnover"].includes(
        field,
      ) &&
      (!Number.isInteger(period) || period! < 2 || period! > 252)
    )
      throw new HttpError(
        400,
        "Indicator period must be 2–252 completed bars.",
      );
    if (["rsi", "delivery_pct"].includes(field) && c.value > 100)
      throw new HttpError(400, "Percent threshold must be 0–100.");
    return {
      field,
      op: c.op as ScanCondition["op"],
      value: c.value,
      period,
      unit: units[field],
    };
  });
  const costs = object(p.costs),
    exit = object(p.exit);
  for (const key of ["feeBps", "slippageBps", "taxBps"])
    if (
      typeof costs[key] !== "number" ||
      !Number.isFinite(costs[key]) ||
      costs[key] < 0 ||
      costs[key] > 1000
    )
      throw new HttpError(400, "Declare nonnegative costs up to 1000 bps.");
  if (
    !Number.isInteger(exit.holdingBars) ||
    Number(exit.holdingBars) < 1 ||
    Number(exit.holdingBars) > 252
  )
    throw new HttpError(400, "Holding period must be 1–252 bars.");
  return {
    schema: "scan-v3.1",
    universe: text(p.universe, "Universe", 120, 1),
    timeframe: "EOD",
    conditions,
    costs: costs as Scan["costs"],
    exit: exit as Scan["exit"],
    dataSource: p.dataSource ? text(p.dataSource, "Dataset", 120, 1) : null,
  };
}
/** Deliberately bounded grammar. Unrecognized words are surfaced; never sent to eval. */
export function parseCommand(input: string): {
  scan: Scan;
  chips: string[];
  ambiguities: string[];
  unrecognized: string[];
} {
  const textValue = text(input, "Command", 500, 1).toLowerCase(),
    scan: Scan = structuredClone(EMPTY_SCAN),
    chips: string[] = [],
    ambiguities: string[] = [];
  let remainder = textValue;
  const sma = /above\s+(?:(\d+)[- ]day\s+)?sma(?:\s*\((\d+)\))?/;
  const m = remainder.match(sma);
  if (m) {
    const period = Number(m[1] || m[2] || 0);
    if (!period) ambiguities.push("Choose the SMA lookback.");
    else {
      scan.conditions.push({
        field: "close_vs_sma",
        op: "gt",
        value: 1,
        period,
        unit: "ratio",
      });
      chips.push("Close > SMA(" + period + ")");
    }
    remainder = remainder.replace(m[0], "");
  }
  const r = remainder.match(
    /rsi(?:\((\d+)\))?\s*(<|>|below|above)\s*(\d+(?:\.\d+)?)/,
  );
  if (r) {
    const period = Number(r[1] || 14);
    scan.conditions.push({
      field: "rsi",
      op: ["<", "below"].includes(r[2]) ? "lt" : "gt",
      value: Number(r[3]),
      period,
      unit: "percent",
    });
    chips.push("RSI(" + period + ") " + r[2] + " " + r[3]);
    if (!r[1]) ambiguities.push("RSI period defaults to 14; confirm or edit.");
    remainder = remainder.replace(r[0], "");
  }
  if (/\bliquid\b/.test(remainder)) {
    ambiguities.push(
      "Set average traded value in INR; “liquid” has no universal threshold.",
    );
    remainder = remainder.replace(/\bliquid\b/g, "");
  }
  const v = remainder.match(
    /(?:average traded value|turnover)\s*(?:>|above)\s*(\d+(?:\.\d+)?)(?:\s*(crore|lakh))?/,
  );
  if (v) {
    const factor = v[2] === "crore" ? 1e7 : v[2] === "lakh" ? 1e5 : 1;
    scan.conditions.push({
      field: "avg_traded_value",
      op: "gt",
      value: Number(v[1]) * factor,
      period: 20,
      unit: "INR",
    });
    chips.push("20-bar average traded value > ₹" + Number(v[1]) * factor);
    ambiguities.push("Average traded value defaults to 20 bars; confirm.");
    remainder = remainder.replace(v[0], "");
  }
  remainder = remainder
    .replace(/\b(find|nse|stocks|shares|above|and|with|eligible|eod)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/\bnse\b/.test(textValue))
    ambiguities.push("Confirm the point-in-time universe.");
  ambiguities.push(
    "Choose an entitled dataset and declare fees, taxes and slippage before execution.",
  );
  return {
    scan,
    chips,
    ambiguities,
    unrecognized: remainder ? [remainder] : [],
  };
}
export function comparable(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  const keys = [
    "datasetHash",
    "universeHash",
    "windowStart",
    "windowEnd",
    "costs",
    "executionModel",
    "foldsHash",
    "adjustmentVersion",
    "evaluatorVersion",
    "sampleType",
  ];
  const missing = keys.filter(
    (k) => a[k] == null || b[k] == null || stable(a[k]) !== stable(b[k]),
  );
  return {
    comparable: missing.length === 0 && a.sampleType === "OOS",
    reasons: missing.length
      ? missing
      : a.sampleType !== "OOS"
        ? ["OOS evidence required"]
        : [],
  };
}
