import { calendarPeriodKey } from "../../engines/chart-analytics";
import { env } from "cloudflare:workers";
import { database, rate } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import type { Candle, Instrument, Interval, ProviderConfig, ProviderId, SharedHistoryGrant } from "./data-types";
import { providerCandles, providerIntradayCandles, ProviderFailure, rightsActive, secretFrom } from "./providers";
import { getExchangeSessionWindowMinutes, getIstDateAndMinutes } from "./angelone/calendar";
import { intradayBarCloseMs } from "./angelone/scan-history";

import { SHARED_HISTORY_LABEL } from "./data-types";
export { SHARED_HISTORY_LABEL } from "./data-types";
const MINUTE = 60_000;
const DAY = 86_400_000;
const LEASE_MS = 75_000;
const MAX_BARS = 3000;
const MAX_BYTES = 800_000;
export type NativeHistoryInterval = "1d" | "30m" | "1h";

type Grant = ProviderConfig & { sharedHistory: SharedHistoryGrant };
type Task = {
  provider: ProviderId; config_version: number; instrument_id: string;
  interval: NativeHistoryInterval; lease_token: string; failures: number;
};
type SnapshotRow = { bars: string; received_at: number; expires_at: number; first_event: string; last_event: string; bar_count: number };
export type SharedHistory = {
  config: Grant; instrument: Instrument; row: SnapshotRow; candles: Candle[];
  interval: NativeHistoryInterval; state: "PUBLISHED_EOD" | "DELAYED" | "STALE";
};

const runtime = () => env as unknown as Record<string, unknown>;
export const nativeInterval = (interval: Interval): NativeHistoryInterval =>
  interval === "30m" || interval === "1h" ? interval : "1d";

export function hasSharedRights(config: ProviderConfig, now = Date.now()): config is Grant {
  return !!config.sharedHistory && config.datasets.includes("candles") &&
    rightsActive(config, "display", now) && rightsActive(config, "analysis", now) &&
    rightsActive(config, "storage", now) && config.rights.derivedDisplay === true &&
    config.rights.redistribution === true;
}

export async function sharedHistoryGrants(now = Date.now()) {
  const rows = await database().prepare("SELECT payload FROM x2_providers ORDER BY provider")
    .all<{ payload: string }>();
  return rows.results.map(({ payload }) => JSON.parse(payload) as ProviderConfig)
    .filter((config): config is Grant => hasSharedRights(config, now) && !!secretFrom(config.provider, runtime()))
    .sort((a, b) => a.priority - b.priority);
}

function dateAt(instrument: Instrument, now: number) {
  return instrument.market === "GLOBAL"
    ? new Intl.DateTimeFormat("en-CA", { timeZone: instrument.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
    : getIstDateAndMinutes(now).dateIST;
}

function sessionClose(instrument: Instrument, day: string) {
  const stamp = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== day) return null;
  if (instrument.market === "GLOBAL") {
    const weekday = new Date(stamp).getUTCDay();
    // Daily foreign feed dates are conservatively eligible once the venue advances to the next date.
    return weekday > 0 && weekday < 6 ? stamp + DAY : null;
  }
  const window = getExchangeSessionWindowMinutes(instrument.market, day);
  return window ? stamp + (window.closeMinutes - 330) * MINUTE : null;
}

export function sharedDailyEventAt(instrument: Instrument, day: string) {
  const close = instrument.market === "GLOBAL" ? null : sessionClose(instrument, day);
  return close === null ? day + "T00:00:00.000Z" : new Date(close).toISOString();
}

function candleClose(instrument: Instrument, interval: NativeHistoryInterval, date: string, now: number) {
  if (interval === "1d") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (instrument.market === "GLOBAL" && date >= dateAt(instrument, now)) return null;
    return sessionClose(instrument, date);
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(date)) return null;
  const event = Date.parse(date);
  if (!Number.isFinite(event) || event % MINUTE !== 0 || instrument.market === "GLOBAL") return null;
  const { dateIST, minutesIST } = getIstDateAndMinutes(event);
  const session = getExchangeSessionWindowMinutes(instrument.market, dateIST);
  const cadence = interval === "30m" ? 30 : 60;
  if (!session || (minutesIST - session.openMinutes) % cadence !== 0) return null;
  return intradayBarCloseMs(instrument.market, event, interval);
}

export function normalizedSharedBars(
  bars: readonly Candle[], instrument: Instrument, interval: NativeHistoryInterval,
  receivedAt: number, lagMinutes: number,
) {
  const sourceCutoff = receivedAt - lagMinutes * MINUTE;
  const unique = new Map<string, Candle>();
  const duplicate = new Set<string>();
  for (const bar of bars) {
    const close = candleClose(instrument, interval, bar.date, receivedAt);
    if (close === null || close > sourceCutoff) continue;
    const { open, high, low, close: price, adjustedClose, volume, openInterest } = bar;
    if (![open, high, low, price].every((value) => Number.isFinite(value) && value > 0) ||
        high < Math.max(open, low, price) || low > Math.min(open, high, price) ||
        [volume, openInterest].some((value) => value !== null && (!Number.isFinite(value) || value < 0)) ||
        (adjustedClose !== null && (!Number.isFinite(adjustedClose) || adjustedClose <= 0))) continue;
    if (unique.has(bar.date)) duplicate.add(bar.date);
    unique.set(bar.date, {
      ...bar, provider: SHARED_HISTORY_LABEL, knownAt: new Date(receivedAt).toISOString(),
    });
  }
  for (const date of duplicate) unique.delete(date);
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_BARS);
}

export function eligibleSharedPeriods(
  bars: Candle[], instrument: Instrument, interval: Interval, at: number,
): Candle[] {
  if (interval !== "1wk" && interval !== "1mo") return bars;
  const current = calendarPeriodKey(dateAt(instrument, at), interval);
  const groups = new Map<string, Candle[]>();
  for (const bar of bars) {
    const key = calendarPeriodKey(bar.date, interval);
    if (key >= current) continue;
    const group = groups.get(key) ?? [];
    group.push(bar);
    groups.set(key, group);
  }
  return [...groups].flatMap(([period, group]) => {
    const firstDay = Date.parse((interval === "1mo" ? period + "-01" : period) + "T00:00:00Z");
    const month = new Date(firstDay);
    const right = interval === "1mo" ? Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)
      : firstDay + 7 * DAY;
    const present = new Set(group.map(({ date }) => date));
    for (let stamp = firstDay; stamp < right; stamp += DAY) {
      const date = new Date(stamp).toISOString().slice(0, 10);
      if (sessionClose(instrument, date) !== null && !present.has(date)) return [];
    }
    return group;
  });
}

function expectedDailyDate(instrument: Instrument, now: number, lagMinutes: number) {
  const day = dateAt(instrument, now);
  const midnight = Date.parse(day + "T00:00:00Z");
  for (let offset = 0; offset < 10; offset++) {
    const date = new Date(midnight - offset * DAY).toISOString().slice(0, 10);
    if (instrument.market === "GLOBAL" && date === day) continue;
    const close = sessionClose(instrument, date);
    if (close !== null && close + lagMinutes * MINUTE <= now) return date;
  }
  return null;
}

function dataState(
  instrument: Instrument, interval: NativeHistoryInterval, event: string, cutoff: number, lagMinutes: number,
): SharedHistory["state"] {
  if (interval === "1d") {
    const expected = expectedDailyDate(instrument, cutoff, lagMinutes);
    return expected && event >= expected ? "PUBLISHED_EOD" : "STALE";
  }
  if (instrument.market === "GLOBAL") return "STALE";
  const eligible = cutoff - lagMinutes * MINUTE;
  const { dateIST, minutesIST } = getIstDateAndMinutes(eligible);
  const eventDate = getIstDateAndMinutes(Date.parse(event)).dateIST;
  const session = getExchangeSessionWindowMinutes(instrument.market, dateIST);
  const step = interval === "30m" ? 30 : 60;
  if (session && minutesIST >= session.openMinutes + step) {
    const end = Math.min(minutesIST, session.closeMinutes);
    const eventTime = candleClose(instrument, interval, event, cutoff);
    const minutesBetween = eventTime === null ? Infinity : (eligible - eventTime) / MINUTE;
    const ageTolerance = step * 2 + Math.max(0, minutesIST - end);
    return eventDate === dateIST && minutesBetween <= ageTolerance ? "DELAYED" : "STALE";
  }
  const previous = expectedDailyDate(instrument, eligible, 0);
  return previous && eventDate >= previous ? "DELAYED" : "STALE";
}

type HistoryReadOptions = { cutoff?: number; provider?: ProviderId; now?: number };

export async function readSharedHistoryBatch(
  ids: readonly string[], interval: Interval, grants: readonly Grant[],
  options: HistoryReadOptions = {},
): Promise<Map<string, SharedHistory>> {
  const resolution = nativeInterval(interval);
  const now = options.now ?? Date.now();
  const cutoff = Math.min(options.cutoff ?? now, now);
  const result = new Map<string, SharedHistory>();
  for (const config of grants) {
    if (!hasSharedRights(config, now) || (options.provider && config.provider !== options.provider) ||
        !config.sharedHistory.intervals.includes(resolution)) continue;
    const mappings = new Map(ids.flatMap((id) => {
      const instrument = resolveSharedInstrument(config, id, cutoff);
      return instrument && !result.has(id) ? [[id, instrument] as const] : [];
    }));
    if (!mappings.size) continue;
    const rows = await database().prepare(
      `WITH wanted(id) AS (SELECT value FROM json_each(?))
       SELECT s.instrument_id,s.bars,s.received_at,s.expires_at,s.first_event,s.last_event,s.bar_count
       FROM wanted w JOIN x8_shared_history_snapshot s ON s.rowid=(
         SELECT t.rowid FROM x8_shared_history_snapshot t
         WHERE t.provider=? AND t.config_version=? AND t.instrument_id=w.id AND t.interval=?
           AND t.received_at<=? AND t.expires_at>? ORDER BY t.received_at DESC LIMIT 1
       ) WHERE EXISTS(SELECT 1 FROM x2_providers p WHERE p.provider=s.provider AND p.version=s.config_version)`,
    ).bind(JSON.stringify([...new Set([...mappings.values()].map(({ id }) => id))]),
      config.provider, config.version, resolution, cutoff, now).all<SnapshotRow & { instrument_id: string }>();
    const byId = new Map(rows.results.map((row) => [row.instrument_id, row]));
    for (const [id, instrument] of mappings) {
      const row = byId.get(instrument.id);
      if (!row) continue;
      const state = dataState(instrument, resolution, row.last_event, cutoff, config.sharedHistory.lagMinutes);
      result.set(id, { config, instrument, row, interval: resolution, candles: JSON.parse(row.bars) as Candle[], state });
    }
  }
  return result;
}

export async function readSharedHistory(id: string, interval: Interval, grants: readonly Grant[], options: HistoryReadOptions = {}) {
  return (await readSharedHistoryBatch([id], interval, grants, options)).get(id) ?? null;
}

export const activeContract = (instrument: Instrument, at: number) =>
  instrument.type !== "FUTURE" || (!!instrument.expiry && instrument.expiry >= dateAt(instrument, at));

function resolveSharedInstrument(config: Grant, id: string, now: number) {
  const direct = config.instruments.find((row) => row.id === id && activeContract(row, now));
  if (direct) return direct;
  if (!["MCX:GOLD", "MCX:SILVER", "GLOBAL:CL"].includes(id)) return undefined;
  const [market, symbol] = id.split(":");
  return config.instruments.filter((row) => row.market === market && row.symbol === symbol &&
    row.type === "FUTURE" && activeContract(row, now) && (id !== "GLOBAL:CL" || row.mic === "XNYM"))
    .sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? "") || a.id.localeCompare(b.id))[0];
}

type DailySummary = {
  instrument_id: string; received_at: number; last_event: string; last_close: number;
  prior_close: number | null; prior_event: string | null; last_volume: number | null;
};
export async function readSharedDailyQuotes(ids: readonly string[], grants: readonly Grant[], now = Date.now()) {
  const result = new Map<string, {
    id: string; value: number; priorClose: number | null; pctChange: number | null; change: number | null;
    latestDate: string; referenceDate: string | null; timestamp: null; receivedAt: string;
    quality: "PUBLISHED_EOD" | "STALE"; unit: string; provider: string; volume: number | null;
    attribution: { label: string; url: string }; instrument: Instrument;
  }>();
  for (const config of grants) {
    if (!hasSharedRights(config, now) || !config.sharedHistory.intervals.includes("1d")) continue;
    const mappings = new Map(ids.flatMap((id) => {
      const instrument = resolveSharedInstrument(config, id, now);
      return instrument && !result.has(id) ? [[id, instrument] as const] : [];
    }));
    if (!mappings.size) continue;
    const rows = await database().prepare(
      `WITH wanted(id) AS (SELECT value FROM json_each(?))
        SELECT s.instrument_id,s.received_at,s.last_event,s.last_close,s.prior_close,s.prior_event,s.last_volume
        FROM wanted w JOIN x8_shared_history_snapshot s ON s.rowid = (
          SELECT t.rowid FROM x8_shared_history_snapshot t
          WHERE t.provider=? AND t.config_version=? AND t.instrument_id=w.id AND t.interval='1d'
          AND t.expires_at>? AND t.received_at<=? ORDER BY t.received_at DESC LIMIT 1
        ) WHERE EXISTS(SELECT 1 FROM x2_providers p WHERE p.provider=s.provider AND p.version=s.config_version)`,
    ).bind(JSON.stringify([...new Set([...mappings.values()].map(({ id }) => id))]),
      config.provider, config.version, now, now).all<DailySummary>();
    const byId = new Map(rows.results.map((row) => [row.instrument_id, row]));
    for (const [id, instrument] of mappings) {
      const row = byId.get(instrument.id);
      if (!row) continue;
      const current = dataState(instrument, "1d", row.last_event, now, config.sharedHistory.lagMinutes);
      const anchor = Date.parse(row.last_event + "T00:00:00Z");
      let previousDay: string | null = null;
      for (let offset = 1; offset <= 10; offset++) {
        const candidate = new Date(anchor - offset * DAY).toISOString().slice(0, 10);
        if (sessionClose(instrument, candidate) !== null) { previousDay = candidate; break; }
      }
      // Some venues publish on a different UTC date. When the expected reference is unknown, omit the change.
      const comparable = row.prior_event === previousDay && row.prior_close !== null && row.prior_close > 0;
      const priorClose = comparable ? row.prior_close : null;
      result.set(id, {
        id, value: row.last_close, priorClose, pctChange: priorClose === null ? null : (row.last_close / priorClose - 1) * 100,
        change: priorClose === null ? null : row.last_close - priorClose, latestDate: row.last_event,
        referenceDate: comparable ? row.prior_event : null, timestamp: null,
        receivedAt: new Date(row.received_at).toISOString(), quality: current === "STALE" ? "STALE" : "PUBLISHED_EOD",
        unit: instrument.unit, volume: row.last_volume, provider: SHARED_HISTORY_LABEL, instrument,
        attribution: { label: config.sharedHistory.attribution, url: config.sharedHistory.attributionUrl },
      });
    }
  }
  return result;
}

async function configurePlan(config: Grant, now: number) {
  const db = database();
  const previous = await db.prepare("SELECT config_version FROM x8_shared_history_plan WHERE provider=?")
    .bind(config.provider).first<number>("config_version");
  if (previous === config.version) return;
  const entries = config.instruments.filter((instrument) => activeContract(instrument, now)).flatMap((instrument) =>
    config.sharedHistory.intervals
      .filter((interval) => interval === "1d" || instrument.market !== "GLOBAL")
      .map((interval) => [instrument.id, interval]));
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO x8_shared_history_task (provider,config_version,instrument_id,interval,next_attempt)
       SELECT ?,?,json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),? FROM json_each(?) j
       WHERE EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)`,
    ).bind(config.provider, config.version, now, JSON.stringify(entries), config.provider, config.version),
    db.prepare(
      `INSERT INTO x8_shared_history_plan(provider,config_version,paused_until,last_error,failures)
       SELECT ?,?,0,NULL,0 WHERE EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?)
       ON CONFLICT(provider) DO UPDATE SET config_version=excluded.config_version,
         paused_until=0,last_error=NULL,failures=0 WHERE config_version<>excluded.config_version`,
    ).bind(config.provider, config.version, config.provider, config.version),
  ]);
}

async function acquire(config: Grant, now: number) {
  const token = crypto.randomUUID();
  return database().prepare(
    `UPDATE x8_shared_history_task SET lease_token=?,lease_until=?
     WHERE (provider,config_version,instrument_id,interval) = (
       SELECT t.provider,t.config_version,t.instrument_id,t.interval FROM x8_shared_history_task t
       JOIN x8_shared_history_plan p USING(provider,config_version)
       WHERE t.provider=? AND t.config_version=? AND t.next_attempt<=? AND t.lease_until<=? AND p.paused_until<=?
       ORDER BY t.next_attempt,t.instrument_id,t.interval LIMIT 1
     ) AND NOT EXISTS(SELECT 1 FROM x8_shared_history_task WHERE provider=? AND lease_until>?)
     RETURNING provider,config_version,instrument_id,interval,lease_token,failures`,
  ).bind(token, now + LEASE_MS, config.provider, config.version, now, now, now, config.provider, now).first<Task>();
}

const consumeProviderBudget = async (config: Grant, now: number) => {
  await rate("x2:provider-minute:" + config.provider, Math.min(config.dailyCallLimit, 30), MINUTE);
  await rate("x2:provider:" + config.provider + ":" + new Date(now).toISOString().slice(0, 10), config.dailyCallLimit, DAY);
};

const providerHistory = (config: Grant, instrument: Instrument, secret: string, interval: NativeHistoryInterval, now: number) =>
  interval === "1d"
    ? providerCandles(config, instrument, secret, fetch, now, config.sharedHistory.dailyLookbackDays)
    : providerIntradayCandles(config, instrument, secret, interval, 45, fetch, now);

async function refresh(task: Task, config: Grant, fetchHistory: typeof providerHistory) {
  const db = database();
  const instrument = config.instruments.find((row) => row.id === task.instrument_id);
  const started = Date.now();
  const secret = secretFrom(config.provider, runtime());
  const keys = [task.provider, task.config_version, task.instrument_id, task.interval, task.lease_token] as const;
  const condition = "provider=? AND config_version=? AND instrument_id=? AND interval=? AND lease_token=?";
  try {
    if (!instrument || !activeContract(instrument, started) || !secret || !hasSharedRights(config, started)) {
      await db.prepare("DELETE FROM x8_shared_history_task WHERE " + condition).bind(...keys).run();
      return;
    }
    await consumeProviderBudget(config, started);
    const source = await fetchHistory(config, instrument, secret, task.interval, started);
    const now = Date.now();
    const bars = normalizedSharedBars(source, instrument, task.interval, now, config.sharedHistory.lagMinutes);
    const payload = JSON.stringify(bars);
    if (!bars.length || new TextEncoder().encode(payload).byteLength > MAX_BYTES)
      throw new ProviderFailure("INVALID_DATA", "Shared history failed normalization or size checks.");
    const expires = Math.min(now + config.sharedHistory.retentionHours * 60 * MINUTE, Date.parse(config.rights.expiresAt));
    const last = bars[bars.length - 1], prior = bars.at(-2);
    const latest = last.date;
    const next = now + (task.interval === "1d" ? config.sharedHistory.dailyRefreshMinutes : config.sharedHistory.intradayRefreshMinutes) * MINUTE;
    const [saved] = await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO x8_shared_history_snapshot(provider,config_version,instrument_id,interval,
          received_at,expires_at,first_event,last_event,bar_count,last_close,prior_close,prior_event,last_volume,bars)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM x8_shared_history_task WHERE ${condition} AND lease_until>?)
         AND EXISTS(SELECT 1 FROM x2_providers WHERE provider=? AND version=?) AND ?>?`,
      ).bind(task.provider, task.config_version, task.instrument_id, task.interval, now, expires,
        bars[0].date, latest, bars.length, last.close, prior?.close ?? null, prior?.date ?? null, last.volume, payload, ...keys, now, config.provider, config.version, expires, now),
      db.prepare(
        "UPDATE x8_shared_history_task SET next_attempt=?,lease_token=NULL,lease_until=0,failures=0,latest_event=?,last_checked=?,last_error=NULL WHERE " + condition,
      ).bind(next, latest, now, ...keys),
      db.prepare("UPDATE x8_shared_history_plan SET failures=0,last_error=NULL WHERE provider=? AND config_version=? AND paused_until<=?")
        .bind(config.provider, config.version, now),
    ]);
    console.info({ event: "shared_history_refresh", outcome: saved.meta.changes ? "stored" : "superseded",
      interval: task.interval, bars: bars.length, rejected: source.length - bars.length, elapsedMs: now - started });
  } catch (error) {
    const now = Date.now();
    const kind = error instanceof ProviderFailure ? error.code
      : error instanceof HttpError && error.status === 429 ? "LOCAL_RATE_BUDGET" : "PROVIDER_DOWN";
    const transient = kind === "PROVIDER_DOWN";
    const backoff = (transient ? Math.min(30, 2 ** Math.min(task.failures, 5)) : 30) * MINUTE + Math.floor(Math.random() * 15_000);
    const retryAfter = error instanceof ProviderFailure ? error.retryAfterMs ?? 0 : 0;
    const wait = Math.max(backoff, retryAfter, kind === "AUTH_FAILED" ? Date.parse(config.rights.expiresAt) - now : 0);
    await db.batch([
      db.prepare(
        "UPDATE x8_shared_history_task SET next_attempt=?,lease_token=NULL,lease_until=0,failures=failures+1,last_checked=?,last_error=? WHERE " + condition,
      ).bind(now + wait, now, kind, ...keys),
      db.prepare(
        `UPDATE x8_shared_history_plan SET failures=failures+1,last_error=?,
          paused_until=CASE WHEN ? IN ('AUTH_FAILED','RATE_LIMITED','LOCAL_RATE_BUDGET') OR failures>=2
                            THEN max(paused_until,?) ELSE paused_until END
         WHERE provider=? AND config_version=?`,
      ).bind(kind, kind, now + wait, config.provider, config.version),
    ]);
    console.warn({ event: "shared_history_refresh", outcome: kind, interval: task.interval, elapsedMs: now - started });
  }
}

export async function hasReadySharedHistory(
  grants: readonly Grant[], interval: Interval, instrumentIds?: readonly string[],
) {
  const resolution = nativeInterval(interval);
  const now = Date.now();
  for (const grant of grants) {
    if (!grant.sharedHistory.intervals.includes(resolution)) continue;
    const ready = await database().prepare(
      `SELECT 1 AS ready FROM x8_shared_history_snapshot WHERE provider=? AND config_version=? AND interval=?
        AND expires_at>? AND received_at<=?
        AND (? IS NULL OR instrument_id IN (SELECT value FROM json_each(?))) LIMIT 1`,
    ).bind(grant.provider, grant.version, resolution, now, now, instrumentIds ? "filtered" : null,
      JSON.stringify(instrumentIds ?? [])).first<number>("ready");
    if (ready) return true;
  }
  return false;
}

export async function sharedIngestionHealth() {
  const now = Date.now();
  return (await database().prepare(
    `SELECT t.provider,p.config_version,p.last_error,p.paused_until,count(*) AS mapped_intervals,
        sum(t.latest_event IS NOT NULL) AS fetched_intervals,
        sum(t.next_attempt<=?) AS due_intervals,
        min(t.last_checked) AS oldest_checked,max(t.last_checked) AS newest_checked
      FROM x8_shared_history_task t JOIN x8_shared_history_plan p USING(provider,config_version)
      GROUP BY t.provider,p.config_version,p.last_error,p.paused_until`,
  ).bind(now).all()).results;
}

export async function refreshSharedHistory(fetchHistory = providerHistory) {
  const now = Date.now();
  const db = database();
  await db.prepare(
    "DELETE FROM x8_shared_history_snapshot WHERE rowid IN (SELECT rowid FROM x8_shared_history_snapshot WHERE expires_at<=? LIMIT 1200)",
  ).bind(now).run();
  const grants = await sharedHistoryGrants(now);
  for (const config of grants) await configurePlan(config, now);
  const stopAt = now + 25_000;
  for (let count = 0; count < 4 && Date.now() < stopAt; count++) {
    let task: Task | null = null;
    for (const config of grants) {
      task = await acquire(config, Date.now());
      if (!task) continue;
      await refresh(task, config, fetchHistory);
      break;
    }
    if (!task) break;
  }
}
