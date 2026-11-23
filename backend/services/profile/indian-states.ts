/**
 * Strategic Souls X5.6 — Canonical Registry of 28 Indian States + 8 Union Territories (36 entries).
 * Voluntary opt-in profile field:
 * - Full name shown in Account Settings selector & tooltip/aria-label
 * - Compact 2-letter code (e.g. "AP", "TN", "TG", "KA", "MH", "DL") shown in public profile capsule
 * - Empty / null means hidden ("Prefer not to show"); never auto-detected from IP or GPS.
 */

export type IndianStateEntry = {
  readonly code: string;
  readonly name: string;
  readonly kind: "STATE" | "UNION_TERRITORY";
};

export const INDIAN_STATES_AND_UTS: readonly IndianStateEntry[] = Object.freeze([
  // ── 28 States ─────────────────────────────────────────────────────────────
  { code: "AP", name: "Andhra Pradesh", kind: "STATE" },
  { code: "AR", name: "Arunachal Pradesh", kind: "STATE" },
  { code: "AS", name: "Assam", kind: "STATE" },
  { code: "BR", name: "Bihar", kind: "STATE" },
  { code: "CG", name: "Chhattisgarh", kind: "STATE" },
  { code: "GA", name: "Goa", kind: "STATE" },
  { code: "GJ", name: "Gujarat", kind: "STATE" },
  { code: "HR", name: "Haryana", kind: "STATE" },
  { code: "HP", name: "Himachal Pradesh", kind: "STATE" },
  { code: "JH", name: "Jharkhand", kind: "STATE" },
  { code: "KA", name: "Karnataka", kind: "STATE" },
  { code: "KL", name: "Kerala", kind: "STATE" },
  { code: "MP", name: "Madhya Pradesh", kind: "STATE" },
  { code: "MH", name: "Maharashtra", kind: "STATE" },
  { code: "MN", name: "Manipur", kind: "STATE" },
  { code: "ML", name: "Meghalaya", kind: "STATE" },
  { code: "MZ", name: "Mizoram", kind: "STATE" },
  { code: "NL", name: "Nagaland", kind: "STATE" },
  { code: "OD", name: "Odisha", kind: "STATE" },
  { code: "PB", name: "Punjab", kind: "STATE" },
  { code: "RJ", name: "Rajasthan", kind: "STATE" },
  { code: "SK", name: "Sikkim", kind: "STATE" },
  { code: "TN", name: "Tamil Nadu", kind: "STATE" },
  { code: "TG", name: "Telangana", kind: "STATE" },
  { code: "TR", name: "Tripura", kind: "STATE" },
  { code: "UP", name: "Uttar Pradesh", kind: "STATE" },
  { code: "UK", name: "Uttarakhand", kind: "STATE" },
  { code: "WB", name: "West Bengal", kind: "STATE" },

  // ── 8 Union Territories ───────────────────────────────────────────────────
  { code: "AN", name: "Andaman and Nicobar Islands", kind: "UNION_TERRITORY" },
  { code: "CH", name: "Chandigarh", kind: "UNION_TERRITORY" },
  {
    code: "DD",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    kind: "UNION_TERRITORY",
  },
  { code: "DL", name: "Delhi", kind: "UNION_TERRITORY" },
  { code: "JK", name: "Jammu and Kashmir", kind: "UNION_TERRITORY" },
  { code: "LA", name: "Ladakh", kind: "UNION_TERRITORY" },
  { code: "LD", name: "Lakshadweep", kind: "UNION_TERRITORY" },
  { code: "PY", name: "Puducherry", kind: "UNION_TERRITORY" },
]);

export const INDIAN_STATE_BY_CODE: ReadonlyMap<string, IndianStateEntry> =
  new Map(INDIAN_STATES_AND_UTS.map((entry) => [entry.code, entry]));

export const INDIAN_STATE_BY_NAME: ReadonlyMap<string, IndianStateEntry> =
  new Map(
    INDIAN_STATES_AND_UTS.map((entry) => [entry.name.toLowerCase(), entry]),
  );

const STATE_CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  TS: "TG",
  UT: "UK",
  UA: "UK",
  OR: "OD",
  CT: "CG",
  DN: "DD",
  DH: "DD",
});

/**
 * Validates and normalizes an incoming state code or full state name.
 * Returns null if blank / hidden ("NONE", "").
 * Throws an Error if non-empty and not in the 36-entry registry.
 */
export function parseIndianStateCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    throw new Error("Choose a valid Indian State or Union Territory, or leave blank.");
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE" || trimmed === "-") {
    return null;
  }
  const upper = trimmed.toUpperCase();
  const aliased = STATE_CODE_ALIASES[upper] ?? upper;
  if (INDIAN_STATE_BY_CODE.has(aliased)) {
    return aliased;
  }
  const byName = INDIAN_STATE_BY_NAME.get(trimmed.toLowerCase());
  if (byName) {
    return byName.code;
  }
  throw new Error(
    "Choose one of the 36 canonical Indian States and Union Territories, or select 'Prefer not to show'.",
  );
}

/**
 * Safe reader for stored DB values: returns the canonical 2-letter code or null if absent/invalid.
 */
export function normalizeStoredStateCode(raw: unknown): string | null {
  try {
    return parseIndianStateCode(raw);
  } catch {
    return null;
  }
}

export function getIndianStateByCode(
  code: string | null | undefined,
): IndianStateEntry | null {
  if (!code) return null;
  const normalized = normalizeStoredStateCode(code);
  if (!normalized) return null;
  return INDIAN_STATE_BY_CODE.get(normalized) ?? null;
}
