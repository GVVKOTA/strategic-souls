import { env } from "cloudflare:workers";
import { database } from "../../../database/queries/repository";
import { indianReportPeriods, ProviderFailure, secretFrom, type IndianReportPeriod } from "./providers";
import { recordProviderBackoff, reserveProviderCall } from "./provider-budget";
import { sharedHistoryGrants } from "./shared-history";

const HOUR = 3_600_000;
const unavailable = (state: "REQUIRES_RIGHTS" | "PENDING" | "UNAVAILABLE") =>
  ({ state, reports: [] as IndianReportPeriod[], retrievedAt: null, attribution: null });

export async function companyReports(id: string, now = Date.now()) {
  const grant = (await sharedHistoryGrants(now)).find(({ provider, datasets }) => provider === "INDIANAPI" && datasets.includes("fundamentals"));
  const instrument = grant?.instruments.find((entry) => entry.id === id);
  if (!grant || !instrument) return unavailable("REQUIRES_RIGHTS");
  const db = database();
  const row = await db.prepare(`SELECT payload,retrieved_at FROM x1_company_reports
    WHERE instrument_id=? AND config_version=? AND expires_at>? AND payload IS NOT NULL`)
    .bind(id, grant.version, now).first<{ payload: string; retrieved_at: number }>();
  const attribution = { label: grant.sharedHistory.attribution, url: grant.sharedHistory.attributionUrl };
  if (row) return { state: "AVAILABLE" as const, reports: JSON.parse(row.payload) as IndianReportPeriod[],
    retrievedAt: new Date(row.retrieved_at).toISOString(), attribution };
  const backoff = await db.prepare(`SELECT 1 FROM x8_shared_history_plan
    WHERE provider='INDIANAPI' AND config_version=? AND paused_until>?`).bind(grant.version, now).first();
  if (backoff) return unavailable("PENDING");
  const runtime = env as unknown as Record<string, unknown>;
  const credential = secretFrom("INDIANAPI", runtime);
  if (!credential) return unavailable("REQUIRES_RIGHTS");
  const token = crypto.randomUUID();
  const lease = await db.prepare(`INSERT INTO x1_company_reports(instrument_id,config_version,lease,lease_until)
    VALUES(?,?,?,?) ON CONFLICT(instrument_id) DO UPDATE SET
      config_version=excluded.config_version,lease=excluded.lease,lease_until=excluded.lease_until,
      payload=NULL,expires_at=0,retry_at=0
    WHERE x1_company_reports.config_version<>excluded.config_version OR
      (x1_company_reports.lease_until<=? AND x1_company_reports.retry_at<=? AND x1_company_reports.expires_at<=?)`)
    .bind(id, grant.version, token, now + 30_000, now, now, now).run();
  if (!lease.meta.changes) return unavailable("PENDING");
  try {
    await reserveProviderCall(grant, now);
    const reports = await indianReportPeriods(instrument.providerSymbol, credential, runtime.INDIA_API_HOST);
    if (!reports.length) throw new ProviderFailure("INVALID_DATA", "No verified statement periods returned.");
    const received = Date.now();
    const expiry = Math.min(received + grant.sharedHistory.retentionHours * HOUR, Date.parse(grant.rights.expiresAt),
      grant.constituentGrant ? Date.parse(grant.constituentGrant.expiresAt) : Infinity);
    const saved = await db.prepare(`UPDATE x1_company_reports SET payload=?,retrieved_at=?,expires_at=?,lease=NULL,lease_until=0
      WHERE instrument_id=? AND config_version=? AND lease=? AND ?>?
      AND EXISTS(SELECT 1 FROM x2_providers WHERE provider='INDIANAPI' AND version=?)`)
      .bind(JSON.stringify(reports), received, expiry, id, grant.version, token, expiry, received, grant.version).run();
    return saved.meta.changes ? { state: "AVAILABLE" as const, reports, attribution,
      retrievedAt: new Date(received).toISOString() } : unavailable("REQUIRES_RIGHTS");
  } catch (err) {
    await recordProviderBackoff(grant, err);
    const retryAt = Date.now() + (err instanceof ProviderFailure && err.code === "LOCAL_RATE_BUDGET"
      ? err.retryAfterMs ?? 60_000 : Math.max(HOUR, err instanceof ProviderFailure ? err.retryAfterMs ?? 0 : 0));
    await db.prepare(`UPDATE x1_company_reports SET retry_at=?,lease=NULL,lease_until=0
      WHERE instrument_id=? AND config_version=? AND lease=?`).bind(retryAt, id, grant.version, token).run();
    return unavailable("UNAVAILABLE");
  }
}

export async function clearExpiredReports(now = Date.now()) {
  await database().prepare(`DELETE FROM x1_company_reports WHERE instrument_id IN (
    SELECT r.instrument_id FROM x1_company_reports r WHERE r.lease_until<=? AND
      ((r.expires_at<=? AND r.retry_at<=?) OR NOT EXISTS(
        SELECT 1 FROM x2_providers p WHERE p.provider='INDIANAPI' AND p.version=r.config_version))
    LIMIT 200)`).bind(now, now, now).run();
}
