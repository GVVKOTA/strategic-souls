import { database } from "../../../database/queries/repository";
import { digest } from "../../engines/engine";
import { HttpError } from "../../middleware/security";

export const NIFTY_500_COUNT = 500;
export type NiftyConstituent = { id: string; isin: string; name: string; industry: string };
type UniverseRow = {
  version: string;
  effective_date: string;
  validated_at: string;
  provenance: string;
  constituents: string;
};

export function validateNifty500(input: unknown): NiftyConstituent[] {
  if (!Array.isArray(input) || input.length !== NIFTY_500_COUNT)
    throw new HttpError(400, "The snapshot must contain exactly 500 NSE equities.");
  const ids = new Set<string>();
  const isins = new Set<string>();
  const constituents = input.map((row: Record<string, unknown> | null) => {
    const { id, isin, name, industry } = row ?? {};
    if (typeof id !== "string" || !/^NSE:[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(id) ||
        typeof isin !== "string" || !/^IN[A-Z0-9]{9}[0-9]$/.test(isin) ||
        typeof name !== "string" || !name.trim() || name.length > 160 ||
        typeof industry !== "string" || !industry.trim() || industry.length > 100)
      throw new HttpError(400, "Each constituent needs a canonical NSE symbol, ISIN, name and industry.");
    if (ids.has(id) || isins.has(isin))
      throw new HttpError(400, "Duplicate NSE symbol or ISIN in the constituent snapshot.");
    ids.add(id);
    isins.add(isin);
    return { id, isin, name: name.trim(), industry: industry.trim() };
  });
  return constituents.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export async function niftyUniverse(version?: string) {
  const db = database();
  const row = await (version
    ? db.prepare("SELECT * FROM x78_market_universes WHERE version=?").bind(version)
    : db.prepare("SELECT * FROM x78_market_universes ORDER BY effective_date DESC,sequence DESC LIMIT 1")
  ).first<UniverseRow>();
  if (!row) return null;
  return {
    version: row.version,
    effectiveDate: row.effective_date,
    validatedAt: row.validated_at,
    provenance: row.provenance,
    constituents: validateNifty500(JSON.parse(row.constituents)),
  };
}

export async function importNiftyUniverse(input: Record<string, unknown>) {
  const constituents = validateNifty500(input.constituents);
  const { effectiveDate, provenance } = input;
  if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
      !Number.isFinite(Date.parse(effectiveDate)) ||
      new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate ||
      Date.parse(effectiveDate) > Date.now() + 86_400_000)
    throw new HttpError(400, "Enter a valid constituent effective date.");
  if (input.rightsConfirmed !== true || typeof provenance !== "string" ||
      provenance.trim().length < 12 || provenance.length > 280)
    throw new HttpError(400, "Record the approved source and confirm rights to use and display the constituent metadata.");
  const version = await digest({ effectiveDate, constituents, provenance: provenance.trim() });
  await database().prepare(
    "INSERT OR IGNORE INTO x78_market_universes (version,effective_date,validated_at,provenance,constituents) VALUES (?,?,?,?,?)",
  ).bind(version, effectiveDate, new Date().toISOString(), provenance.trim(), JSON.stringify(constituents)).run();
  const active = await niftyUniverse();
  return { version, count: constituents.length, active: active?.version === version };
}
