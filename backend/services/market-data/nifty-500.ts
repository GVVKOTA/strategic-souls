import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import { HttpError } from "../../middleware/security";

export const NIFTY_500_COUNT = 500;
export const EXPLICIT_SCOPE_VERSION = "x8-scoped-v1";
export async function niftyUniverseRightsActive(version: string) {
  return !!await database().prepare(
    "SELECT 1 FROM x78_market_universes WHERE version=? AND effective_date<=? AND rights_expires_at>?",
  ).bind(version, todayInIndia(), new Date().toISOString()).first();
}
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now());
export type NiftyConstituent = {
  id: string;
  isin: string;
  name: string;
  industry: string;
  series?: string;
};
type UniverseRow = {
  version: string;
  effective_date: string;
  validated_at: string;
  provenance: string;
  constituents: string;
  expected_count: number;
  rights_expires_at: string;
};

export function validateNifty500(input: unknown, expectedCount = NIFTY_500_COUNT): NiftyConstituent[] {
  if (!Number.isInteger(expectedCount) || expectedCount < 450 || expectedCount > 550 ||
      !Array.isArray(input) || input.length !== expectedCount)
    throw new HttpError(400, "The snapshot must match the documented official constituent count.");
  const ids = new Set<string>();
  const isins = new Set<string>();
  const constituents = input.map((row: Record<string, unknown> | null) => {
    const { id, isin, name, industry, series } = row ?? {};
    if (typeof id !== "string" || !/^NSE:[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(id) ||
        typeof isin !== "string" || !/^IN[A-Z0-9]{9}[0-9]$/.test(isin) ||
        typeof name !== "string" || !name.trim() || name.length > 160 ||
        typeof industry !== "string" || !industry.trim() || industry.length > 100)
      throw new HttpError(400, "Each constituent needs a canonical NSE symbol, ISIN, name and industry.");
    if (series !== undefined && (typeof series !== "string" || !/^[A-Z0-9]{1,8}$/.test(series.trim())))
      throw new HttpError(400, "Optional exchange series must be 1–8 uppercase alphanumeric characters.");
    if (ids.has(id) || isins.has(isin))
      throw new HttpError(400, "Duplicate NSE symbol or ISIN in the constituent snapshot.");
    ids.add(id);
    isins.add(isin);
    return {
      id,
      isin,
      name: name.trim(),
      industry: industry.trim(),
      ...(typeof series === "string" ? { series: series.trim() } : {}),
    };
  });
  return constituents.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export async function niftyUniverse(version?: string) {
  const db = database();
  const now = new Date().toISOString();
  const today = todayInIndia();
  const row = await (version
    ? db.prepare("SELECT * FROM x78_market_universes WHERE version=? AND effective_date<=? AND rights_expires_at>?").bind(version, today, now)
    : db.prepare(`SELECT * FROM x78_market_universes
      WHERE effective_date<=? AND rights_expires_at>?
      ORDER BY effective_date DESC,sequence DESC LIMIT 1`).bind(today, now)
  ).first<UniverseRow>();
  if (!row) return null;
  const constituents = validateNifty500(JSON.parse(row.constituents), row.expected_count);
  return {
    version: row.version,
    effectiveDate: row.effective_date,
    validatedAt: row.validated_at,
    provenance: row.provenance,
    rightsExpiresAt: row.rights_expires_at,
    expectedCount: row.expected_count,
    distinctCount: constituents.length,
    constituents,
  };
}

export async function importNiftyUniverse(input: Record<string, unknown>) {
  const expectedCount = input.expectedCount === undefined ? NIFTY_500_COUNT : input.expectedCount;
  if (typeof expectedCount !== "number")
    throw new HttpError(400, "Provide the official constituent count as a number.");
  const constituents = validateNifty500(input.constituents, expectedCount);
  const { effectiveDate, provenance, rightsExpiresAt } = input;
  if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
      !Number.isFinite(Date.parse(effectiveDate)) ||
      new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate ||
      Date.parse(effectiveDate) > Date.now() + 86_400_000)
    throw new HttpError(400, "Enter a valid constituent effective date.");
  if (input.rightsConfirmed !== true || typeof provenance !== "string" ||
      provenance.trim().length < 12 || provenance.length > 280)
    throw new HttpError(400, "Record the approved source and confirm rights to use and display the constituent metadata.");
  const expiry = typeof rightsExpiresAt === "string" ? Date.parse(rightsExpiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= Date.now())
    throw new HttpError(400, "Provide the future expiry of the licensed constituent delivery.");
  const expiresAt = new Date(expiry).toISOString();
  const version = await digest({ effectiveDate, constituents, provenance: provenance.trim(), expiresAt });
  await database().prepare(
    `INSERT OR IGNORE INTO x78_market_universes
      (version,effective_date,validated_at,provenance,constituents,expected_count,rights_expires_at)
      VALUES (?,?,?,?,?,?,?)`,
  ).bind(version, effectiveDate, new Date().toISOString(), provenance.trim(),
    JSON.stringify(constituents), expectedCount, expiresAt).run();
  const active = await niftyUniverse();
  return { version, count: constituents.length, active: active?.version === version };
}
