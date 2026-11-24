import { database } from "../../../database/queries/repository";
import { triggeredPriceAlert, type AlertRule } from "../../engines/price-alert";
import { HttpError } from "../../middleware/security";
import { readSharedDailyQuotes, sharedHistoryGrants } from "./shared-history";

const ALERT_LIMIT = 30;
const CHECK_LIMIT = 48;
const ALERT_INTERVAL = 15 * 60_000;
type AlertRow = {
  id: string; subject: string; instrument_id: string; rule: AlertRule; threshold: number;
  recurring: number; state: "ACTIVE" | "PAUSED" | "FIRED"; version: number; last_session: string | null;
  trigger_session: string | null; trigger_value: number | null; trigger_grant: number | null;
  trigger_expires_at: number | null;
};

async function alertGrant(now = Date.now()) {
  return (await sharedHistoryGrants(now)).find(({ provider }) => provider === "INDIANAPI");
}

export async function listPriceAlerts(subject: string) {
  const now = Date.now();
  const [grant, rows] = await Promise.all([
    alertGrant(now),
    database().prepare("SELECT * FROM x1_price_alerts WHERE subject=? ORDER BY created_at DESC,id LIMIT 30")
      .bind(subject).all<AlertRow>(),
  ]);
  return {
    available: !!grant,
    alerts: rows.results.map((row) => {
      const trigger = grant && row.trigger_grant === grant.version && (row.trigger_expires_at ?? 0) > now
        ? { session: row.trigger_session, value: row.trigger_value, source: grant.sharedHistory.attribution } : null;
      return { id: row.id, instrumentId: row.instrument_id, rule: row.rule, threshold: row.threshold,
        recurring: !!row.recurring, state: row.state === "FIRED" && !trigger ? "PAUSED" as const : row.state,
        version: row.version, lastSession: grant ? row.last_session : null, trigger };
    }),
  };
}

export async function mutatePriceAlert(subject: string, input: Record<string, unknown>) {
  const { action, id, version, instrumentId, rule, threshold, recurring } = input;
  const db = database();
  if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new HttpError(400, "Invalid alert identifier.");
  const existing = await db.prepare("SELECT * FROM x1_price_alerts WHERE id=? AND subject=?").bind(id, subject).first<AlertRow>();
  if (action === "save") {
    if (typeof instrumentId !== "string" || typeof rule !== "string" || !["ABOVE", "BELOW", "RISE", "FALL"].includes(rule) ||
        typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0 ||
        threshold > (rule === "RISE" || rule === "FALL" ? 100 : 1e10) || typeof recurring !== "boolean")
      throw new HttpError(400, "Choose an NSE instrument, supported rule and valid trigger.");
    if (existing && existing.instrument_id === instrumentId && existing.rule === rule &&
        existing.threshold === threshold && existing.recurring === Number(recurring)) return listPriceAlerts(subject);
    const grant = await alertGrant();
    if (!grant?.instruments.some((instrument) => instrument.id === instrumentId))
      throw new HttpError(409, "Price alerts require licensed Indian API closes for this instrument.");
    const result = version === undefined
      ? await db.prepare(`INSERT OR IGNORE INTO x1_price_alerts(id,subject,instrument_id,rule,threshold,recurring,state,created_at)
        SELECT ?,?,?,?,?,?,'ACTIVE',? WHERE (SELECT count(*) FROM x1_price_alerts WHERE subject=?)<?`)
        .bind(id, subject, instrumentId, rule, threshold, +recurring, new Date().toISOString(), subject, ALERT_LIMIT).run()
      : await db.prepare(`UPDATE x1_price_alerts SET instrument_id=?,rule=?,threshold=?,recurring=?,state='ACTIVE',
        version=version+1,last_session=NULL,checked_at=0,trigger_session=NULL,trigger_value=NULL,trigger_grant=NULL,trigger_expires_at=NULL
        WHERE id=? AND subject=? AND version=?`).bind(instrumentId, rule, threshold, +recurring, id, subject, version).run();
    if (!result.meta.changes) throw new HttpError(409, "Alert changed or the 30-alert limit was reached. Refresh the list.");
  } else {
    if (!existing) {
      if (action === "delete") return listPriceAlerts(subject);
      throw new HttpError(404, "Alert unavailable.");
    }
    if (typeof version !== "number" || !Number.isInteger(version))
      throw new HttpError(400, "Refresh the saved alert before editing.");
    if (action === "resume") {
      const grant = await alertGrant();
      if (!grant?.instruments.some(({ id }) => id === existing.instrument_id))
        throw new HttpError(409, "Licensed price data is required to resume the alert.");
    }
    const result = action === "delete"
      ? await db.prepare("DELETE FROM x1_price_alerts WHERE id=? AND subject=? AND version=?").bind(id, subject, version).run()
      : action === "pause" || action === "resume"
        ? await db.prepare(`UPDATE x1_price_alerts SET state=?,version=version+1,last_session=NULL,checked_at=0
          WHERE id=? AND subject=? AND version=?`).bind(action === "pause" ? "PAUSED" : "ACTIVE", id, subject, version).run()
        : null;
    if (!result) throw new HttpError(400, "Choose a valid alert action.");
    if (!result.meta.changes) throw new HttpError(409, "Alert changed. Refresh the list.");
  }
  return listPriceAlerts(subject);
}

export async function checkPriceAlerts(now = Date.now()) {
  const db = database();
  const grant = await alertGrant(now);
  await db.prepare(`UPDATE x1_price_alerts SET trigger_value=NULL,trigger_expires_at=NULL,trigger_grant=NULL
    WHERE rowid IN (SELECT rowid FROM x1_price_alerts WHERE trigger_expires_at IS NOT NULL
      AND (trigger_expires_at<=? OR trigger_grant IS NOT ?) LIMIT 300)`).bind(now, grant?.version ?? null).run();
  if (!grant) return;
  const alerts = await db.prepare(`SELECT z.* FROM x1_price_alerts z JOIN accounts a ON a.subject=z.subject
    WHERE z.state='ACTIVE' AND z.checked_at<=? AND a.adult_confirmed=1 AND a.consent_version='2026-11-14-v4'
    ORDER BY z.checked_at,z.id LIMIT ?`).bind(now - ALERT_INTERVAL, CHECK_LIMIT).all<AlertRow>();
  if (!alerts.results.length) return;
  const ids = [...new Set(alerts.results.map((row) => row.instrument_id))];
  const quotes = await readSharedDailyQuotes(ids, [grant], now);
  await db.batch(alerts.results.map((row) => {
    const quote = quotes.get(row.instrument_id);
    if (!quote || quote.quality !== "PUBLISHED_EOD" || quote.latestDate <= (row.last_session ?? ""))
      return db.prepare("UPDATE x1_price_alerts SET checked_at=? WHERE id=? AND version=? AND state='ACTIVE'")
        .bind(now, row.id, row.version);
    const hit = row.last_session !== null && row.last_session === quote.referenceDate && quote.priorClose !== null
      && triggeredPriceAlert(row.rule, row.threshold, quote.priorClose, quote.value);
    return db.prepare(`UPDATE x1_price_alerts SET checked_at=?,last_session=?,state=?,
      trigger_session=CASE WHEN ? THEN ? ELSE trigger_session END,trigger_value=CASE WHEN ? THEN ? ELSE trigger_value END,
      trigger_grant=CASE WHEN ? THEN ? ELSE trigger_grant END,trigger_expires_at=CASE WHEN ? THEN ? ELSE trigger_expires_at END
      WHERE id=? AND version=? AND state='ACTIVE' AND last_session IS ?
        AND EXISTS(SELECT 1 FROM x2_providers WHERE provider='INDIANAPI' AND version=?)`)
      .bind(now, quote.latestDate, hit && !row.recurring ? "FIRED" : "ACTIVE",
        +hit, quote.latestDate, +hit, quote.value, +hit, grant.version, +hit, quote.expiresAt,
        row.id, row.version, row.last_session, grant.version);
  }));
}
