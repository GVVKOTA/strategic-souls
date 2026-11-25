import { calendarPeriodKey } from "../../engines/chart-analytics";
import { env } from "cloudflare:workers";
import { database } from "../../../database/queries/repository";
import { HttpError } from "../../middleware/security";
import type {
  Candle,
  Instrument,
  Interval,
  ProviderConfig,
  ProviderId,
  SharedErrorCode,
  SharedHistoryGrant,
  SharedRightsMode,
} from "./data-types";
import { recordProviderBackoff, reserveProviderCall } from "./provider-budget";
import {
  indianDailyPrices,
  type IndianDailyPrice,
  providerCandles,
  providerIntradayCandles,
  ProviderFailure,
  requiresCreditWindow,
  rightsActive,
  secretFrom,
  verifiedCreditWindow,
} from "./providers";
import { getExchangeSessionWindowMinutes, getIstDateAndMinutes } from "./exchange-calendar";
import { intradayBarCloseMs } from "./candle-sessions";
import { OFFICIAL_FX_PAIRS } from "./market-data";
import { niftyUniverse } from "./nifty-500";
import { matchesScanMarketPreset, type ScanUniversePreset } from "../research/research";

import { SHARED_HISTORY_LABEL } from "./data-types";
export { SHARED_HISTORY_LABEL } from "./data-types";
const MINUTE = 60_000;
const DAY = 86_400_000;
const LEASE_MS = 75_000;
const MAX_BARS = 3000;
const MAX_BYTES = 800_000;
export type NativeHistoryInterval = "1d" | "30m" | "1h";

export type SharedGrant = ProviderConfig & { sharedHistory: SharedHistoryGrant };
type Task = {
  provider: ProviderId; config_version: number; instrument_id: string;
  interval: NativeHistoryInterval; lease_token: string; failures: number;
};
type SnapshotRow = { bars: string; received_at: number; expires_at: number; first_event: string; last_event: string; bar_count: number };
export type SharedHistory = {
  config: SharedGrant; instrument: Instrument; row: SnapshotRow; candles: Candle[]; prices?: IndianDailyPrice[];
  interval: NativeHistoryInterval; state: "PUBLISHED_EOD" | "DELAYED" | "STALE";
};
export type SharedUniverseReadiness = {
  membership: {
    version: string;
    effectiveDate: string;
    validatedAt: string;
    expectedCount: number;
    distinctCount: number;
    count: number;
    rightsExpiresAt: string;
  } | null;
  status: "READY" | "WARMING" | "RATE_LIMITED" | "BLOCKED_BY_UNIVERSE" | "BLOCKED_BY_DATA_RIGHTS" | "EXPIRED";
  reasonCode: SharedErrorCode | null;
  reason: string;
  rightsMode: SharedRightsMode;
  warming: boolean;
  sourceQuality: "PUBLISHED_EOD" | "STALE" | "UNAVAILABLE";
  eligibleIntervals: Interval[];
  latestEventDate: string | null;
  lastRefreshAt: string | null;
  nextRefreshAt: string | null;
  pausedUntil: string | null;
  lastError: string | null;
  attribution: { label: string; url: string } | null;
  coverage: {
    expected: number;
    mapped: number;
    fetched: number;
    ready: number;
    stale: number;
    unavailable: number;
    pct: number;
  };
  providers: {
    provider: ProviderId;
    active: boolean;
    secretConfigured: boolean;
    rightsMode: SharedRightsMode;
    expiresAt: string | null;
    mappedCount: number;
    readyCount: number;
    staleCount: number;
    pausedUntil: string | null;
    lastError: string | null;
  }[];
};

const runtime = () => env as unknown as Record<string, unknown>;
export function isOwnerSubject(subject: string) {
  const owner = runtime().X2_OWNER_SUBJECT;
  return typeof owner === "string" && owner.length > 0 && owner === subject;
}
export async function canScanExchange(
  interval: Interval,
  instrumentIds?: readonly string[],
  provider?: ProviderId,
) {
  const grants = await sharedHistoryGrants(Date.now(), "research");
  return hasReadySharedHistory(
    provider ? grants.filter((grant) => grant.provider === provider) : grants,
    interval,
    instrumentIds,
  );
}
export async function scanScopeInstruments(preset: ScanUniversePreset, interval: Interval) {
  if (preset === "ECB_DAILY") return OFFICIAL_FX_PAIRS.map(({ id }) => id).sort();
  if (preset === "NIFTY_500") {
    const active = await niftyUniverse().catch(() => null);
    return active ? active.constituents.map(({ id }) => id) : [];
  }
  const now = Date.now();
  const ids = (await sharedHistoryGrants(now, "research"))
    .filter((grant) => grant.sharedHistory.intervals.includes(nativeInterval(interval)))
    .flatMap((grant) => grant.instruments)
    .filter((instrument) => activeContract(instrument, now) &&
      matchesScanMarketPreset(preset, instrument.market, instrument.type, instrument.expiry))
    .map(({ id }) => id);
  return [...new Set(ids)].sort();
}
export async function hasLegacySharedCommercialConfig(now = Date.now()): Promise<boolean> {
  try {
    const rows = await database().prepare("SELECT payload FROM x2_providers ORDER BY provider").all<{ payload: string }>();
    return rows.results
      .map((r) => JSON.parse(r.payload) as ProviderConfig)
      .some((c) => !c.sharedHistory && c.rights.redistribution && rightsActive(c, "analysis", now) && rightsActive(c, "storage", now));
  } catch {
    return false;
  }
}
export const nativeInterval = (interval: Interval): NativeHistoryInterval =>
  interval === "30m" || interval === "1h" ? interval : "1d";

/**
 * Derived-only shared rights permit server-side ingestion, caching, analysis, and returning
 * derived PASS/FAIL/UNKNOWN outcomes without exposing raw exchange prices or OHLCV bars.
 */
export function hasSharedDerivedRights(config: ProviderConfig, now = Date.now()): config is SharedGrant {
  return (
    !!config.sharedHistory &&
    config.datasets.includes(config.provider === "INDIANAPI" ? "prices" : "candles") &&
    (!requiresCreditWindow(config.provider) || !!verifiedCreditWindow(config.sharedHistory.creditWindow)) &&
    rightsActive(config, "analysis", now) &&
    rightsActive(config, "storage", now) &&
    config.rights.derivedDisplay === true
  );
}

/**
 * Full shared display rights additionally require explicit display and redistribution entitlements.
 */
export function hasSharedDisplayRights(config: ProviderConfig, now = Date.now()): config is SharedGrant {
  return (
    hasSharedDerivedRights(config, now) &&
    rightsActive(config, "display", now) &&
    config.rights.redistribution === true
  );
}

export function hasSharedRights(
  config: ProviderConfig,
  now = Date.now(),
  mode: "display" | "derived" = "display",
): config is SharedGrant {
  return mode === "derived" ? hasSharedDerivedRights(config, now) : hasSharedDisplayRights(config, now);
}

export function sharedRightsMode(config: ProviderConfig, now = Date.now()): SharedRightsMode {
  if (hasSharedDisplayRights(config, now)) return "DISPLAY_AND_DERIVED";
  if (hasSharedDerivedRights(config, now)) return "DERIVED_ONLY";
  return "NONE";
}

export async function sharedHistoryGrants(
  now = Date.now(),
  purpose: "research" | "display" | "dashboard" | "ingestion" = "display",
): Promise<SharedGrant[]> {
  let rows: { results: { payload: string }[] };
  try {
    rows = await database().prepare("SELECT payload FROM x2_providers ORDER BY provider")
      .all<{ payload: string }>();
  } catch {
    return [];
  }
  const mode = purpose === "research" || purpose === "ingestion" ? "derived" : "display";
  return rows.results
    .map(({ payload }) => JSON.parse(payload) as ProviderConfig)
    .filter((config): config is SharedGrant =>
      hasSharedRights(config, now, mode) && !!secretFrom(config.provider, runtime()),
    )
    .filter((config) => {
      if (purpose === "ingestion") return true;
      if (purpose === "dashboard") {
        return config.provider === "BHARATSTOCK" && config.instruments.some((inst) => inst.type === "INDEX");
      }
      // Research and equity display exclude index-only BharatStock dashboard configs.
      if (config.provider === "BHARATSTOCK") {
        return config.instruments.some((inst) => inst.type === "EQUITY");
      }
      return true;
    })
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

export function eligibleSharedPeriods<T extends { date: string }>(
  bars: T[], instrument: Instrument, interval: Interval, at: number,
): T[] {
  if (interval !== "1wk" && interval !== "1mo") return bars;
  const current = calendarPeriodKey(dateAt(instrument, at), interval);
  const groups = new Map<string, T[]>();
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

type HistoryReadOptions = {
  cutoff?: number;
  provider?: ProviderId;
  now?: number;
  requireDisplay?: boolean;
};

export async function readSharedHistoryBatch(
  ids: readonly string[], interval: Interval, grants: readonly SharedGrant[],
  options: HistoryReadOptions = {},
): Promise<Map<string, SharedHistory>> {
  const resolution = nativeInterval(interval);
  const now = options.now ?? Date.now();
  const cutoff = Math.min(options.cutoff ?? now, now);
  const mode = options.requireDisplay ? "display" : "derived";
  const result = new Map<string, SharedHistory>();
  for (const config of grants) {
    if (!hasSharedRights(config, now, mode) || (options.provider && config.provider !== options.provider) ||
        !config.sharedHistory.intervals.includes(resolution)) continue;
    const mappings = new Map(ids.flatMap((id) => {
      const instrument = resolveSharedInstrument(config, id, cutoff);
      return instrument && !result.has(id) ? [[id, instrument] as const] : [];
    }));
    if (!mappings.size) continue;
    let rows: { results: (SnapshotRow & { instrument_id: string })[] };
    try {
      rows = await database().prepare(
        `WITH wanted(id) AS (SELECT value FROM json_each(?))
         SELECT s.instrument_id,s.bars,s.received_at,s.expires_at,s.first_event,s.last_event,s.bar_count
         FROM wanted w JOIN x8_shared_history_snapshot s ON s.rowid=(
           SELECT t.rowid FROM x8_shared_history_snapshot t
           WHERE t.provider=? AND t.config_version=? AND t.instrument_id=w.id AND t.interval=?
             AND t.received_at<=? AND t.expires_at>? ORDER BY t.received_at DESC LIMIT 1
         ) WHERE EXISTS(SELECT 1 FROM x2_providers p WHERE p.provider=s.provider AND p.version=s.config_version)`,
      ).bind(JSON.stringify([...new Set([...mappings.values()].map(({ id }) => id))]),
        config.provider, config.version, resolution, cutoff, now).all<SnapshotRow & { instrument_id: string }>();
    } catch {
      continue;
    }
    const byId = new Map(rows.results.map((row) => [row.instrument_id, row]));
    for (const [id, instrument] of mappings) {
      const row = byId.get(instrument.id);
      if (!row) continue;
      const state = dataState(instrument, resolution, row.last_event, cutoff, config.sharedHistory.lagMinutes);
      result.set(id, {
        config,
        instrument,
        row,
        interval: resolution,
        ...(config.provider === "INDIANAPI"
          ? { prices: JSON.parse(row.bars) as IndianDailyPrice[], candles: [] }
          : { candles: JSON.parse(row.bars) as Candle[] }),
        state,
      });
    }
  }
  return result;
}

export async function readSharedHistory(
  id: string,
  interval: Interval,
  grants: readonly SharedGrant[],
  options: HistoryReadOptions = {},
) {
  return (await readSharedHistoryBatch([id], interval, grants, options)).get(id) ?? null;
}

export const activeContract = (instrument: Instrument, at: number) =>
  instrument.type !== "FUTURE" || (!!instrument.expiry && instrument.expiry >= dateAt(instrument, at));

function resolveSharedInstrument(config: SharedGrant, id: string, now: number) {
  const direct = config.instruments.find((row) => row.id === id && activeContract(row, now));
  if (direct) return direct;
  if (!["MCX:GOLD", "MCX:SILVER", "GLOBAL:CL"].includes(id)) return undefined;
  const [market, symbol] = id.split(":");
  return config.instruments.filter((row) => row.market === market && row.symbol === symbol &&
    row.type === "FUTURE" && activeContract(row, now) && (id !== "GLOBAL:CL" || row.mic === "XNYM"))
    .sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? "") || a.id.localeCompare(b.id))[0];
}

type DailySummary = {
  instrument_id: string; received_at: number; expires_at: number; last_event: string; last_close: number;
  prior_close: number | null; prior_event: string | null; last_volume: number | null;
  period_day?: string | null; period_close?: number | null; period_anchor?: string;
};
export async function readSharedDailyQuotes(ids: readonly string[], grants: readonly SharedGrant[], now = Date.now(),
  period: "1D" | "1W" | "1M" | "YTD" = "1D") {
  const result = new Map<string, {
    id: string; value: number; priorClose: number | null; pctChange: number | null; change: number | null;
    latestDate: string; referenceDate: string | null; timestamp: null; receivedAt: string; expiresAt: number;
    quality: "PUBLISHED_EOD" | "STALE"; unit: string; provider: string; providerId: ProviderId; volume: number | null;
    attribution: { label: string; url: string }; instrument: Instrument;
  }>();
  for (const config of grants) {
    // Raw price quotes strictly require full display + redistribution rights.
    if (!hasSharedDisplayRights(config, now) || !config.sharedHistory.intervals.includes("1d")) continue;
    const mappings = new Map(ids.flatMap((id) => {
      const instrument = resolveSharedInstrument(config, id, now);
      return instrument && !result.has(id) ? [[id, instrument] as const] : [];
    }));
    if (!mappings.size) continue;
    const history = period === "1D" ? null : period === "1W" ? "-7 days" : period === "1M" ? "-31 days" : "start of year";
    const snapshots = `WITH wanted(id) AS (SELECT value FROM json_each(?)), latest AS (
        SELECT s.instrument_id,s.received_at,s.expires_at,s.last_event,s.last_close,s.prior_close,s.prior_event,s.last_volume
          ${history ? ", s.bars" : ""}
        FROM wanted w JOIN x8_shared_history_snapshot s ON s.rowid = (
          SELECT t.rowid FROM x8_shared_history_snapshot t
          WHERE t.provider=? AND t.config_version=? AND t.instrument_id=w.id AND t.interval='1d'
          AND t.expires_at>? AND t.received_at<=? ORDER BY t.received_at DESC LIMIT 1
        ) WHERE EXISTS(SELECT 1 FROM x2_providers p WHERE p.provider=s.provider AND p.version=s.config_version)
      )`;
    const params = [JSON.stringify([...new Set([...mappings.values()].map(({ id }) => id))]), config.provider, config.version, now, now];
    let rows: { results: DailySummary[] };
    try {
      rows = await (history ? database().prepare(snapshots + `, anchored AS (
          SELECT latest.*, date(last_event,?,?) period_anchor FROM latest
        ), bases AS (
          SELECT anchored.*, (SELECT value FROM json_each(anchored.bars) j
            WHERE json_extract(value,'$.date')<=period_anchor AND json_extract(value,'$.date')>=date(period_anchor,'-10 days')
            ORDER BY CAST(j.key AS INTEGER) DESC LIMIT 1) base FROM anchored
        ) SELECT instrument_id,received_at,expires_at,last_event,last_close,prior_close,prior_event,last_volume,period_anchor,
          json_extract(base,'$.date') period_day,json_extract(base,'$.close') period_close FROM bases`)
          .bind(...params, history, period === "YTD" ? "-1 day" : "+0 days")
        : database().prepare(snapshots + " SELECT * FROM latest").bind(...params)).all<DailySummary>();
    } catch {
      continue;
    }
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
      const previous = history ? row.period_day : row.prior_event === previousDay ? row.prior_event : null;
      const price = history ? row.period_close : row.prior_close;
      const priorClose = previous && typeof price === "number" && price > 0 ? price : null;
      result.set(id, {
        id, value: row.last_close, priorClose, pctChange: priorClose === null ? null : (row.last_close / priorClose - 1) * 100,
        change: priorClose === null ? null : row.last_close - priorClose, latestDate: row.last_event,
        referenceDate: priorClose === null ? null : previous ?? null, timestamp: null,
        receivedAt: new Date(row.received_at).toISOString(), expiresAt: row.expires_at,
        quality: current === "STALE" ? "STALE" : "PUBLISHED_EOD",
        unit: instrument.unit, volume: row.last_volume, provider: SHARED_HISTORY_LABEL, providerId: config.provider, instrument,
        attribution: { label: config.sharedHistory.attribution, url: config.sharedHistory.attributionUrl },
      });
    }
  }
  return result;
}

async function configurePlan(config: SharedGrant, now: number) {
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

async function acquire(config: SharedGrant, now: number) {
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

const providerHistory = (config: SharedGrant, instrument: Instrument, secret: string, interval: NativeHistoryInterval, now: number) =>
  interval === "1d"
    ? providerCandles(config, instrument, secret, fetch, now, config.sharedHistory.dailyLookbackDays)
    : providerIntradayCandles(config, instrument, secret, interval, 45, fetch, now);

async function refresh(task: Task, config: SharedGrant, fetchHistory: typeof providerHistory) {
  const db = database();
  const instrument = config.instruments.find((row) => row.id === task.instrument_id);
  const started = Date.now();
  const secret = secretFrom(config.provider, runtime());
  const keys = [task.provider, task.config_version, task.instrument_id, task.interval, task.lease_token] as const;
  const condition = "provider=? AND config_version=? AND instrument_id=? AND interval=? AND lease_token=?";
  try {
    if (!instrument || !activeContract(instrument, started) || !secret || !hasSharedDerivedRights(config, started)) {
      await db.prepare("DELETE FROM x8_shared_history_task WHERE " + condition).bind(...keys).run();
      return;
    }
    await reserveProviderCall(config, started);
    const prices = config.provider === "INDIANAPI"
      ? await indianDailyPrices(instrument.providerSymbol, secret, runtime().INDIA_API_HOST) : null;
    const source = prices ? [] : await fetchHistory(config, instrument, secret, task.interval, started);
    const now = Date.now();
    const bars = prices ? prices.filter((price) => {
      const close = sessionClose(instrument, price.date);
      return close !== null && close + config.sharedHistory.lagMinutes * MINUTE <= now;
    }) : normalizedSharedBars(source, instrument, task.interval, now, config.sharedHistory.lagMinutes);
    const payload = JSON.stringify(bars);
    if (!bars.length || new TextEncoder().encode(payload).byteLength > MAX_BYTES)
      throw new ProviderFailure("INVALID_DATA", "Shared history failed normalization or size checks.");
    const expires = Math.min(now + config.sharedHistory.retentionHours * 60 * MINUTE,
      Date.parse(config.rights.expiresAt), config.constituentGrant ? Date.parse(config.constituentGrant.expiresAt) : Infinity);
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
      interval: task.interval, bars: bars.length, rejected: (prices ?? source).length - bars.length, elapsedMs: now - started });
  } catch (error) {
    const now = Date.now();
    await recordProviderBackoff(config, error, now);
    const kind = error instanceof ProviderFailure ? error.code
      : error instanceof HttpError && error.status === 429 ? "LOCAL_RATE_BUDGET" : "PROVIDER_DOWN";
    const transient = kind === "PROVIDER_DOWN";
    const backoff = (transient ? Math.min(30, 2 ** Math.min(task.failures, 5)) : 30) * MINUTE + Math.floor(Math.random() * 15_000);
    const retryAfter = error instanceof ProviderFailure ? error.retryAfterMs ?? 0 : 0;
    const wait = kind === "LOCAL_RATE_BUDGET" ? Math.max(1000, retryAfter)
      : Math.max(backoff, retryAfter, kind === "AUTH_FAILED" ? Date.parse(config.rights.expiresAt) - now : 0);
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
  grants: readonly SharedGrant[], interval: Interval, instrumentIds?: readonly string[],
  mode: "some" | "all" = "some",
) {
  const resolution = nativeInterval(interval);
  const now = Date.now();
  for (const grant of grants) {
    if (!grant.sharedHistory.intervals.includes(resolution)) continue;
    const needsCompletedSession = grant.provider === "INDIANAPI" || grant.provider === "BHARATSTOCK";
    if (!grant.instruments.length) continue;
    const earliest = needsCompletedSession
      ? expectedDailyDate(grant.instruments[0], now, grant.sharedHistory.lagMinutes) : null;
    if (needsCompletedSession && (!earliest || interval === "1h" || interval === "30m")) continue;
    let ready: number | null = null;
    try {
      ready = await database().prepare(
        `SELECT ${mode === "all" ? "count(DISTINCT instrument_id)" : "1"} AS ready
          FROM x8_shared_history_snapshot WHERE provider=? AND config_version=? AND interval=?
          AND expires_at>? AND received_at<=?
          AND (? IS NULL OR last_event >= ?)
          AND (?=0 OR julianday(last_event)-julianday(first_event)>=?)
          AND EXISTS(SELECT 1 FROM x2_providers p WHERE p.provider=? AND p.version=?)
          AND (? IS NULL OR instrument_id IN (SELECT value FROM json_each(?))) LIMIT 1`,
      ).bind(grant.provider, grant.version, resolution, now, now, earliest, earliest,
        interval === "1wk" || interval === "1mo" ? 1 : 0, interval === "1mo" ? 62 : 14, grant.provider, grant.version,
        instrumentIds ? "filtered" : null,
        JSON.stringify(instrumentIds ?? [])).first<number>("ready");
    } catch {
      continue;
    }
    if (mode === "all" ? !!instrumentIds?.length && ready === new Set(instrumentIds).size : !!ready) return true;
  }
  return false;
}

export async function sharedIngestionHealth() {
  const now = Date.now();
  try {
    return (await database().prepare(
      `SELECT t.provider,p.config_version,p.last_error,p.paused_until,count(*) AS mapped_intervals,
          sum(t.latest_event IS NOT NULL) AS fetched_intervals,
          sum(t.next_attempt<=?) AS due_intervals,
          min(t.last_checked) AS oldest_checked,max(t.last_checked) AS newest_checked
        FROM x8_shared_history_task t JOIN x8_shared_history_plan p USING(provider,config_version)
        GROUP BY t.provider,p.config_version,p.last_error,p.paused_until`,
    ).bind(now).all()).results;
  } catch {
    return [];
  }
}

export async function sharedUniverseReadiness(now = Date.now()): Promise<SharedUniverseReadiness> {
  const db = database();
  const [membership, rawProviderRows] = await Promise.all([
    niftyUniverse().catch(() => null),
    db.prepare("SELECT payload FROM x2_providers ORDER BY provider")
      .all<{ payload: string }>()
      .then((res) => res.results.map((r) => JSON.parse(r.payload) as ProviderConfig))
      .catch(() => [] as ProviderConfig[]),
  ]);
  const sharedConfigs = rawProviderRows
    .filter((c) => !!c.sharedHistory && (c.provider !== "BHARATSTOCK" || c.instruments.some((i) => i.type === "EQUITY")))
    .sort((a, b) => a.priority - b.priority);
  const activeGrants = sharedConfigs.filter(
    (c): c is SharedGrant => hasSharedDerivedRights(c, now) && !!secretFrom(c.provider, runtime()),
  );
  const expiredShared = sharedConfigs.some(
    (c) => c.enabled && c.rights.verified && Date.parse(c.rights.expiresAt) <= now,
  );
  const membershipIds = membership ? new Set(membership.constituents.map((c) => c.id)) : null;

  const providerSummaries: SharedUniverseReadiness["providers"] = [];
  let totalMapped = 0;
  let totalFetched = 0;
  let totalReady = 0;
  let totalStale = 0;
  let latestEventDate: string | null = null;
  let lastRefreshMs: number | null = null;
  let nextRefreshMs: number | null = null;
  let pausedUntilMs: number | null = null;
  let lastError: string | null = null;
  const intervalSet = new Set<Interval>();

  for (const config of sharedConfigs) {
    const mode = sharedRightsMode(config, now);
    const secretConfigured = !!secretFrom(config.provider, runtime());
    const active = mode !== "NONE" && secretConfigured;
    const equityInstruments = config.instruments.filter((i) => i.type === "EQUITY" && (!membershipIds || membershipIds.has(i.id)));
    const mappedCount = equityInstruments.length;
    let readyCount = 0;
    let staleCount = 0;
    let pPaused: number | null = null;
    let pError: string | null = null;

    if (active && config.sharedHistory) {
      if (config.sharedHistory.intervals.includes("1d")) {
        intervalSet.add("1d");
        intervalSet.add("1wk");
        intervalSet.add("1mo");
      }
      if (config.sharedHistory.intervals.includes("30m")) intervalSet.add("30m");
      if (config.sharedHistory.intervals.includes("1h")) intervalSet.add("1h");

      const sampleInst = equityInstruments[0] ?? config.instruments[0];
      const expectedDay = sampleInst ? expectedDailyDate(sampleInst, now, config.sharedHistory.lagMinutes) : null;
      try {
        const [snapStats, planRow, taskRow] = await Promise.all([
          db.prepare(
            `WITH latest AS (
               SELECT s.instrument_id, s.last_event, s.received_at
               FROM x8_shared_history_snapshot s
               WHERE s.provider=? AND s.config_version=? AND s.interval='1d'
                 AND s.expires_at>? AND s.received_at<=?
                 AND s.rowid = (
                   SELECT t.rowid FROM x8_shared_history_snapshot t
                   WHERE t.provider=s.provider AND t.config_version=s.config_version
                     AND t.instrument_id=s.instrument_id AND t.interval='1d'
                     AND t.expires_at>? AND t.received_at<=?
                   ORDER BY t.received_at DESC LIMIT 1
                 )
             )
             SELECT count(*) AS fetched,
               sum(CASE WHEN ? IS NULL OR last_event >= ? THEN 1 ELSE 0 END) AS fresh,
               max(last_event) AS max_event,
               max(received_at) AS max_received
             FROM latest`,
          ).bind(config.provider, config.version, now, now, now, now, expectedDay, expectedDay)
            .first<{ fetched: number; fresh: number | null; max_event: string | null; max_received: number | null }>(),
          db.prepare("SELECT paused_until, last_error FROM x8_shared_history_plan WHERE provider=? AND config_version=?")
            .bind(config.provider, config.version)
            .first<{ paused_until: number; last_error: string | null }>(),
          db.prepare("SELECT min(next_attempt) AS next_at, max(last_checked) AS last_chk FROM x8_shared_history_task WHERE provider=? AND config_version=? AND interval='1d'")
            .bind(config.provider, config.version)
            .first<{ next_at: number | null; last_chk: number | null }>(),
        ]);
        const fetched = Number(snapStats?.fetched ?? 0);
        readyCount = Number(snapStats?.fresh ?? 0);
        staleCount = Math.max(0, fetched - readyCount);
        totalMapped = Math.max(totalMapped, mappedCount);
        totalFetched = Math.max(totalFetched, fetched);
        totalReady = Math.max(totalReady, readyCount);
        totalStale = Math.max(totalStale, staleCount);
        if (snapStats?.max_event && (!latestEventDate || snapStats.max_event > latestEventDate)) {
          latestEventDate = snapStats.max_event;
        }
        const checked = Math.max(Number(snapStats?.max_received ?? 0), Number(taskRow?.last_chk ?? 0));
        if (checked > 0 && (!lastRefreshMs || checked > lastRefreshMs)) lastRefreshMs = checked;
        if (taskRow?.next_at && (!nextRefreshMs || taskRow.next_at < nextRefreshMs)) nextRefreshMs = taskRow.next_at;
        if (planRow && planRow.paused_until > now) {
          pPaused = planRow.paused_until;
          pError = planRow.last_error;
          if (!pausedUntilMs || pPaused > pausedUntilMs) pausedUntilMs = pPaused;
          if (pError) lastError = pError;
        } else if (planRow?.last_error) {
          pError = planRow.last_error;
          lastError ??= pError;
        }
      } catch {
        /* Fail closed with zero ready count if shared tables are unavailable */
      }
    }

    providerSummaries.push({
      provider: config.provider,
      active,
      secretConfigured,
      rightsMode: mode,
      expiresAt: config.rights.expiresAt ?? null,
      mappedCount,
      readyCount,
      staleCount,
      pausedUntil: pPaused ? new Date(pPaused).toISOString() : null,
      lastError: pError,
    });
  }

  const primaryGrant = activeGrants[0] ?? null;
  const rightsMode: SharedRightsMode = primaryGrant ? sharedRightsMode(primaryGrant, now) : "NONE";
  const expected = membership?.distinctCount ?? 500;
  const unavailable = Math.max(0, (totalMapped || expected) - totalReady - totalStale);
  const pct = expected > 0 ? Math.round((totalReady / expected) * 1000) / 10 : 0;

  let status: SharedUniverseReadiness["status"];
  let reasonCode: SharedErrorCode | null;
  let reason: string;
  if (!membership) {
    status = "BLOCKED_BY_UNIVERSE";
    reasonCode = "NIFTY_UNIVERSE_UNAVAILABLE";
    reason = "An authorized, unexpired Nifty 500 constituent snapshot has not been imported yet.";
  } else if (!primaryGrant) {
    if (expiredShared) {
      status = "EXPIRED";
      reasonCode = "DATA_EXPIRED";
      reason = "The configured shared market-data entitlement has expired. Renew rights before scanning.";
    } else {
      status = "BLOCKED_BY_DATA_RIGHTS";
      reasonCode = "MISSING_PERMISSION";
      reason = "No active shared NSE market-data provider grant is configured for standard accounts.";
    }
  } else if (totalReady === 0) {
    if (pausedUntilMs && pausedUntilMs > now && (lastError === "RATE_LIMITED" || lastError === "LOCAL_RATE_BUDGET")) {
      status = "RATE_LIMITED";
      reasonCode = "PROVIDER_RATE_LIMITED";
      reason = "Shared market-data ingestion is paused due to provider request limits and will resume automatically.";
    } else {
      status = "WARMING";
      reasonCode = "PENDING_INITIAL_INGEST";
      reason = `Preparing Nifty 500 daily data — ${totalFetched} of ${totalMapped || expected} instruments cached; scans will unlock once completed history is indexed.`;
    }
  } else {
    status = "READY";
    reasonCode = null;
    reason = totalReady < (totalMapped || expected)
      ? `Nifty 500 daily data is warming (${totalReady} of ${totalMapped || expected} instruments ready).`
      : `Nifty 500 daily data ready (${totalReady} of ${expected} instruments).`;
  }

  return {
    membership: membership
      ? {
          version: membership.version,
          effectiveDate: membership.effectiveDate,
          validatedAt: membership.validatedAt,
          expectedCount: membership.expectedCount,
          distinctCount: membership.distinctCount,
          count: membership.constituents.length,
          rightsExpiresAt: membership.rightsExpiresAt,
        }
      : null,
    status,
    reasonCode,
    reason,
    rightsMode,
    warming: status === "WARMING" || (status === "READY" && totalReady < (totalMapped || expected)),
    sourceQuality: totalReady > 0 ? "PUBLISHED_EOD" : totalStale > 0 ? "STALE" : "UNAVAILABLE",
    eligibleIntervals: [...intervalSet],
    latestEventDate,
    lastRefreshAt: lastRefreshMs ? new Date(lastRefreshMs).toISOString() : null,
    nextRefreshAt: nextRefreshMs ? new Date(nextRefreshMs).toISOString() : null,
    pausedUntil: pausedUntilMs ? new Date(pausedUntilMs).toISOString() : null,
    lastError,
    attribution: primaryGrant
      ? { label: primaryGrant.sharedHistory.attribution, url: primaryGrant.sharedHistory.attributionUrl }
      : null,
    coverage: {
      expected,
      mapped: totalMapped,
      fetched: totalFetched,
      ready: totalReady,
      stale: totalStale,
      unavailable,
      pct,
    },
    providers: providerSummaries,
  };
}

export async function purgeExpiredSharedHistory(now = Date.now()) {
  try {
    await database().prepare(
      "DELETE FROM x8_shared_history_snapshot WHERE rowid IN (SELECT rowid FROM x8_shared_history_snapshot WHERE expires_at<=? LIMIT 1200)",
    ).bind(now).run();
  } catch {
    /* Table unavailable in legacy test harness */
  }
}

export async function refreshSharedHistory(fetchHistory = providerHistory) {
  const now = Date.now();
  await purgeExpiredSharedHistory(now);
  const grants = await sharedHistoryGrants(now, "ingestion");
  for (const config of grants) await configurePlan(config, now);
  if (!grants.length) return;
  const first = Math.trunc(now / (2 * MINUTE)) % grants.length;
  const stopAt = now + 25_000;
  for (let count = 0; count < 6 && Date.now() < stopAt; count++) {
    let task: Task | null = null;
    for (let offset = 0; offset < grants.length; offset++) {
      const config = grants[(first + count + offset) % grants.length];
      task = await acquire(config, Date.now());
      if (!task) continue;
      await refresh(task, config, fetchHistory);
      break;
    }
    if (!task) break;
  }
}
