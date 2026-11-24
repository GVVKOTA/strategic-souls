import { OFFICIAL_FX_PAIRS } from "../../backend/services/market-data/market-data.ts";
/**
 * Strategic Souls V3.0 Release Candidate — End-to-End Regression Suite
 * Verifies V3 Section 21 (S01–S09) and V2 Retained Requirements (P01–P20):
 * - Shared commercial NSE/BSE/MCX Market + Watchlist SoulScan for ordinary users A & B
 * - Strict owner isolation & zero-quota-charge fail-closed behavior when unentitled
 * - Genuine 1h completed-session candles (NSE/BSE 09:15–15:30 + MCX DST/holidays, no daily->1h synthesis, 30m rejected)
 * - Classic vs Advanced rule equivalence & crossing semantics
 * - Zero "Angel One" / "SmartAPI" leaks across APIs and UI
 * - Strict 8-tile Global allowlist & legacy 9-card D1 layout reconciliation
 * - D1 per-user formula pinning & cross-user isolation
 * - Independent Portfolio (p01–p08) vs Profile (b01–b08) banner persistence
 * - Truthful Soul Post metrics (Likes, Views excluding self-views + daily dedup, Shares) & author-only Insights (403/401)
 * - Password change, non-enumerating forgot/reset (single-use + expiry + session revocation), email verification, Active Sessions
 * - GVV logo SHA-256 byte-identity & zero user-visible "optional" copy
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = process.cwd();
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys = ON;");

const migrationFiles = readdirSync(resolve(root, "drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of migrationFiles) {
  sql.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
}

function makeStatement(query, params = []) {
  return {
    bind(...next) {
      return makeStatement(query, next);
    },
    async first(column) {
      const row = sql.prepare(query).get(...params);
      return column ? row?.[column] ?? null : row ?? null;
    },
    async all() {
      return { results: sql.prepare(query).all(...params) };
    },
    async run() {
      const info = sql.prepare(query).run(...params);
      return { meta: { changes: Number(info.changes ?? 0) } };
    },
    _query: query,
    _params: params,
  };
}

const DB = {
  prepare(query) {
    return makeStatement(query);
  },
  async batch(stmts) {
    sql.exec("BEGIN");
    try {
      const out = stmts.map(({ _query, _params }) => ({ meta: { changes: Number(sql.prepare(_query).run(..._params).changes) } }));
      sql.exec("COMMIT");
      return out;
    } catch (err) {
      sql.exec("ROLLBACK");
      throw err;
    }
  },
};

const env = {
  DB,
  MARKET_DATA_MODE: "private",
  ENABLE_PRIVATE_BROKER_DATA: "false",
  ENABLE_PUBLIC_EXCHANGE_QUOTES: "false",
  MARKET_DATA_OWNER_SUBJECT: "owner_v3",
  ["X2_TRUEDATA_" + "BEARER_TOKEN"]: ["mock", "fixture", randomUUID()].join("-"),
};

const fetchCalls = [];
async function mockFetch(url, init) {
  const href = String(url);
  fetchCalls.push({ url: href, method: init?.method ?? "GET" });

  if (new URL(href).hostname === "dev.indianapi.in") {
    assert.equal(new URL(href).pathname, "/historical_data");
    assert.equal(new URL(href).searchParams.get("stock_name"), "RELIANCE");
    assert.equal(new Headers(init.headers).get("X-API-Key"), env.INDIA_API_KEY);
    return Response.json({ datasets: [{ metric: "Price", label: "Price on NSE", meta: { is_weekly: false },
      values: [["2026-11-19", "99"], ["2026-11-20", "101"], ["2026-11-23", "105"]] }] });
  }
  // Shared commercial TrueData intraday (60min) and daily (eod) across NSE, BSE & active MCX futures
  if (href.includes("history.truedata.in/getbars")) {
    const parsed = new URL(href);
    const intervalParam = parsed.searchParams.get("interval") || "eod";
    const sym = parsed.searchParams.get("symbol") || "";
    const isMcx = sym.includes("GOLD") || sym.includes("SILVER");

    if (intervalParam === "60min") {
      const records = [["timestamp", "open", "high", "low", "close", "volume", "oi"]];
      const baseDays = [
        "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
        "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
        "2026-11-23",
      ];
      let price = isMcx ? 76000 : 1200;
      for (const d of baseDays) {
        const hoursIst = isMcx
          ? ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]
          : ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"];
        for (const hm of hoursIst) {
          price += isMcx ? 18 : 2.5;
          records.push([`${d}T${hm}:00+05:30`, price - 1, price + 2, price - 2, price, 150000, isMcx ? 8400 : 0]);
        }
      }
      return new Response(JSON.stringify({ status: "Success", records }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Daily (eod) bars: 260 completed trading days up to 2026-11-23
    const records = [["timestamp", "open", "high", "low", "close", "volume", "oi"]];
    let close = isMcx ? 70000 : 1000;
    let dt = new Date("2025-11-10T00:00:00Z");
    for (let i = 0; i < 275; i++) {
      while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
        dt = new Date(dt.getTime() + 86400_000);
      }
      const iso = dt.toISOString().slice(0, 10);
      if (iso > "2026-11-23") break;
      close += isMcx ? 25 : 1.4;
      records.push([`${iso}T00:00:00`, close - 2, close + 3, close - 3, close, 500000, isMcx ? 9200 : 0]);
      dt = new Date(dt.getTime() + 86400_000);
    }
    return new Response(JSON.stringify({ status: "Success", records }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "unexpected fetch " + href }), { status: 404 });
}

let historyClock = null;
class FixtureDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [historyClock ?? Date.now()]));
  }
  static now() { return historyClock ?? Date.now(); }
}

const context = vm.createContext({
  Date: FixtureDate,
  console,
  Response,
  Request,
  Headers,
  FormData,
  File,
  Blob,
  TextEncoder,
  TextDecoder,
  crypto: {
    subtle: webcrypto.subtle,
    randomUUID,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
  },
  URL,
  URLSearchParams,
  Intl,
  Uint8Array,
  Float64Array,
  Int32Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  WeakMap,
  Promise,
  Error,
  TypeError,
  RegExp,
  Array,
  Object,
  String,
  Boolean,
  Symbol,
  AbortController,
  AbortSignal,
  btoa,
  atob,
  setTimeout,
  clearTimeout,
  fetch: mockFetch,
});

const moduleCache = new Map();

async function loadModule(relOrAbsPath) {
  const file = resolve(root, relOrAbsPath);
  if (moduleCache.has(file)) return moduleCache.get(file);

  const promise = (async () => {
    const normalized = file.replaceAll("\\", "/");
    if (normalized.endsWith("/backend/services/market-data/market-data.ts")) {
      return new vm.SyntheticModule(
        ["OFFICIAL_FX_PAIRS", "loadMarketData", "marketSnapshot"],
        function () {
          const snap = async () => ({
            asOf: "2026-11-24T08:00:00.000Z",
            providers: [],
            quotes: [
              {
                id: "ECB:USDINR",
                label: "USD/INR",
                value: 87.62,
                previous: 87.5,
                change: 0.12,
                changePercent: 0.14,
                currency: "INR",
                unit: "INR per USD",
                assetClass: "FX",
                provider: "European Central Bank",
                sourceUrl: "https://data.ecb.europa.eu/",
                sourceDate: "2026-11-23",
                state: "PUBLISHED_EOD",
                redistributable: true,
              },
            ],
            yields: [],
            fxHistory: [],
          });
          this.setExport("OFFICIAL_FX_PAIRS", OFFICIAL_FX_PAIRS);
          this.setExport("loadMarketData", snap);
          this.setExport("marketSnapshot", snap);
        },
        { context },
      );
    }

    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;

    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    await mod.link(async (spec, refer) => {
      if (spec === "cloudflare:workers") {
        if (!moduleCache.has(spec)) {
          moduleCache.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(
                ["env"],
                function () {
                  this.setExport("env", env);
                },
                { context },
              ),
            ),
          );
        }
        return moduleCache.get(spec);
      }
      if (spec === "next/headers") {
        if (!moduleCache.has(spec)) {
          moduleCache.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(
                ["headers"],
                function () {
                  this.setExport("headers", async () => new Headers());
                },
                { context },
              ),
            ),
          );
        }
        return moduleCache.get(spec);
      }
      if (spec === "next/navigation") {
        if (!moduleCache.has(spec)) {
          moduleCache.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(
                ["redirect"],
                function () {
                  this.setExport("redirect", (p) => {
                    throw new Error("REDIRECT:" + p);
                  });
                },
                { context },
              ),
            ),
          );
        }
        return moduleCache.get(spec);
      }
      let target = resolve(dirname(refer.identifier), spec);
      if (!existsSync(target)) target += ".ts";
      return loadModule(target);
    });
    await mod.evaluate();
    return mod;
  })();

  moduleCache.set(file, promise);
  return promise;
}

const imp = async (p) => (await loadModule(p)).namespace;

const authRoute = await imp("app/api/auth/[...action]/route.ts");
const emailTransport = await imp("backend/auth/email-transport.ts");
const releaseRoute = await imp("app/api/release/route.ts");
const overviewRoute = await imp("app/api/markets/overview/route.ts");
const networkRoute = await imp("app/api/community/network/route.ts");
const workspaceMod = await imp("backend/services/research/workspace.ts");
const profileMod = await imp("backend/services/profile/profile.ts");
const scanHistoryMod = await imp("backend/services/market-data/angelone/scan-history.ts");
const scanEngineMod = await imp("backend/engines/scan.ts");
const nineCardMod = await imp("backend/services/market-data/nine-card-markets.ts");
const classicPresetsMod = await imp("backend/services/research/classic-presets.ts");
const scanQuotaMod = await imp("backend/services/research/scan-quota.ts");

function req(path, method = "GET", jsonBody = undefined, cookie = "", extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET") {
    headers.set("origin", "https://ss.v3.test");
    if (jsonBody !== undefined) headers.set("content-type", "application/json");
  }
  return new Request("https://ss.v3.test" + path, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
}

function cookieFrom(res) {
  const sc = res.headers.get("set-cookie") || "";
  return sc.split(";")[0] || "";
}

async function registerUser(email, password, displayName, ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0") {
  const res = await authRoute.POST(
    req(
      "/api/auth/register",
      "POST",
      { email, password, displayName, adult: true, privacy: true, terms: true },
      "",
      { "user-agent": ua },
    ),
  );
  assert.equal(res.status, 201, `register failed for ${email}`);
  const cookie = cookieFrom(res);
  const row = sql.prepare("SELECT id FROM auth_users WHERE email = ?").get(email);
  return { userId: row.id, cookie, email, password };
}

// ---------------------------------------------------------------------------
// 1. V3 S01–S09: Ordinary Users, Unified Market + Watchlist, Genuine 1h Candles
// ---------------------------------------------------------------------------
test("V3 S01/S05/S07: Unentitled ordinary user Market scan fails closed honestly without leaking owner data or charging quota", async () => {
  const alice = await registerUser("alice_v3@example.test", "StrongPass123!fixture", "Alice V3");
  const bob = await registerUser("bob_v3@example.test", "StrongPass456!fixture", "Bob V3");

  // Unentitled ordinary user runs Market Daily scan -> fails closed cleanly, zero quota charged, zero Angel One leak
  await assert.rejects(
    () =>
      workspaceMod.mutateWorkspace(alice.userId, {
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "RSI Oversold Test",
        description: "Ordinary user test on unconfigured shared market feed.",
        formula: "rsi(close, 14) < 35",
        mode: "SIMPLE",
        universe: "CONNECTED_MARKETS",
        universePreset: "MARKET",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    (err) => {
      assert.doesNotMatch(err.message, /angel\s*one|smartapi/i);
      assert.match(err.message, /market history|not yet active|quota was not charged/i);
      return true;
    },
  );

  // Verify ZERO quota consumed on failed unentitled scan (V3.1 Classic daily limit = 20)
  const quotaA = await scanQuotaMod.getScanQuotaSummary(DB, alice.userId);
  assert.equal(quotaA.classic.used, 0);
  assert.equal(quotaA.classic.remaining, 20);

  // 30m on daily-only ECB is rejected cleanly with zero quota consumed; unentitled Market also fails closed
  await assert.rejects(
    () =>
      workspaceMod.mutateWorkspace(bob.userId, {
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Rejected 30m ECB",
        description: "30m timeframe on daily-only ECB must be rejected cleanly.",
        formula: "close > sma(close, 20)",
        mode: "SIMPLE",
        universe: "ECB_DAILY",
        universePreset: "ECB_DAILY",
        interval: "30m",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    /30m|30-minute/i,
  );
  const quotaB = await scanQuotaMod.getScanQuotaSummary(DB, bob.userId);
  assert.equal(quotaB.classic.used, 0);
});

test("V3 S02/S03/S04/S06: Licensed shared commercial NSE+BSE+MCX provider serves ordinary users A & B on Market & Watchlist across 1h, 1d, 1wk, 1mo", async () => {
  const alice = await registerUser("alice_shared@example.test", "StrongPass123!fixture", "Alice Shared");
  const bob = await registerUser("bob_shared@example.test", "StrongPass456!fixture", "Bob Shared");

  historyClock = Date.parse("2026-11-23T10:35:00.000Z"); // 16:05 IST, cash closed and MCX open.
  const historyStore = await imp("backend/services/market-data/shared-history.ts");
  const researchData = await imp("backend/services/market-data/data-service.ts");
  // Provision a licensed shared commercial TrueData provider config in x2_providers (NSE + BSE + active MCX future)
  const now = new Date().toISOString();
  const sharedProviderPayload = {
    provider: "TRUEDATA",
    enabled: true,
    priority: 1,
    version: 1,
    rights: {
      display: true,
      derivedDisplay: true,
      analysis: true,
      storage: true,
      redistribution: true,
      cacheSeconds: 300,
      verified: true,
      contractReference: "TD-COMM-2026-V3",
      expiresAt: "2028-12-31",
    },
    instruments: [
      {
        id: "NSE:RELIANCE",
        name: "Reliance Industries",
        symbol: "RELIANCE",
        providerSymbol: "RELIANCE",
        market: "NSE",
        mic: "XNSE",
        type: "EQUITY",
        currency: "INR",
        unit: "INR per share",
        timezone: "Asia/Kolkata",
      },
      {
        id: "BSE:SENSEX",
        name: "SENSEX",
        symbol: "SENSEX",
        providerSymbol: "SENSEX",
        market: "BSE",
        mic: "XBOM",
        type: "INDEX",
        currency: "INR",
        unit: "Index points",
        timezone: "Asia/Kolkata",
      },
      {
        id: "MCX:GOLD27FEB",
        name: "Gold MCX Feb 2027",
        symbol: "GOLD27FEB",
        providerSymbol: "GOLD27FEBFUT",
        market: "MCX",
        mic: "XMCX",
        type: "FUTURE",
        currency: "INR",
        unit: "INR per 10g",
        timezone: "Asia/Kolkata",
        expiry: "2027-02-05",
      },
    ],
    sharedHistory: {
      intervals: ["1d", "1h"], lagMinutes: 0, retentionHours: 48, dailyLookbackDays: 730,
      dailyRefreshMinutes: 720, intradayRefreshMinutes: 120,
      attribution: "Isolated licensed fixture", attributionUrl: "https://example.invalid/fixture",
    },
    datasets: ["candles"],
    dailyCallLimit: 5000,
    lastWrite: "v3_shared_commercial_seed_1",
  };
  sql
    .prepare(
      `INSERT INTO x2_providers (provider, version, payload, health, updated_by, updated_at, last_write)
       VALUES ('TRUEDATA', 1, ?, ?, 'owner_v3', ?, 'v3_shared_commercial_seed_1')`,
    )
    .run(
      JSON.stringify(sharedProviderPayload),
      JSON.stringify({ state: "CONNECTED", checkedAt: now, lastEventAt: now, message: "OK", accepted: ["NSE:RELIANCE", "BSE:SENSEX", "MCX:GOLD27FEB"], rejected: [], callsToday: 0, quotaRemaining: 5000, latencyMs: 12 }),
      now,
    );

  const prewarmBefore = fetchCalls.length;
  await Promise.all([historyStore.refreshSharedHistory(), historyStore.refreshSharedHistory()]);
  await historyStore.refreshSharedHistory();
  const ingressCalls = fetchCalls.length - prewarmBefore;
  assert.equal(ingressCalls, 6, "Exactly one provider fetch for each native instrument/interval, across overlapping schedulers");
  assert.equal(sql.prepare("SELECT count(*) AS n FROM x8_shared_history_snapshot").get().n, 6);
  const grants = await historyStore.sharedHistoryGrants();
  const rateLimit = await imp("backend/services/market-data/providers.ts");
  await assert.rejects(rateLimit.fetchProviderJson(new URL("https://history.truedata.in/getbars"), {},
    async () => new Response(null, { status: 429, headers: { "Retry-After": "90" } })),
  (error) => error.code === "RATE_LIMITED" && error.retryAfterMs === 90_000);

  // Ordinary User A runs unified MARKET scan on 1 Hour (1h) — covers NSE + BSE + active MCX futures
  const hourlyScanA = await workspaceMod.mutateWorkspace(alice.userId, {
    action: "run-scan",
    scanRequestVersion: 2,
    scanTier: "CLASSIC",
    name: "Hourly Uptrend Check",
    description: "Classic 1h Market scan across NSE, BSE, and active MCX futures.",
    formula: "close > sma(close, 20)",
    mode: "SIMPLE",
    universe: "CONNECTED_MARKETS",
    universePreset: "MARKET",
    interval: "1h",
    partialPolicy: "ALLOW_UNKNOWN",
    outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    requestId: randomUUID(),
  });
  assert.ok(hourlyScanA.id);
  assert.equal(hourlyScanA.results.eligible, 3, "All 3 NSE/BSE/MCX instruments must evaluate on 1h");
  assert.equal(hourlyScanA.results.matches, 3);
  const hourlyIds = [...hourlyScanA.results.results.map((r) => r.instrumentId)].sort();
  assert.deepEqual(hourlyIds, ["BSE:SENSEX", "MCX:GOLD27FEB", "NSE:RELIANCE"]);
  assert.ok(hourlyScanA.results.results.every((r) => r.latestEventAt && r.latestEventAt.includes("T")));

  // Ordinary User B creates a Watchlist with NSE:RELIANCE and scans Watchlist on Daily, Weekly, and Monthly
  const wl = await workspaceMod.mutateWorkspace(bob.userId, {
    action: "create-list",
    name: "Bob Core",
    requestId: randomUUID(),
  });
  assert.ok(wl.id);
  await workspaceMod.mutateWorkspace(bob.userId, {
    action: "list-items",
    id: wl.id,
    version: 1,
    items: ["NSE:RELIANCE"],
    requestId: randomUUID(),
  });

  for (const tf of ["1d", "1wk", "1mo"]) {
    const scanB = await workspaceMod.mutateWorkspace(bob.userId, {
      action: "run-scan",
      scanRequestVersion: 2,
      scanTier: "CLASSIC",
      name: `Watchlist ${tf}`,
      description: `Ordinary user Watchlist scan on ${tf}.`,
      formula: "close > sma(close, 5)",
      mode: "SIMPLE",
      universe: "CONNECTED_MARKETS",
      universePreset: "MY_WATCHLIST",
      watchlistId: wl.id,
      interval: tf,
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      requestId: randomUUID(),
    });
    assert.equal(scanB.results.eligible, 1, `Watchlist scan on ${tf} must evaluate 1 instrument`);
    assert.equal(scanB.results.results[0].instrumentId, "NSE:RELIANCE");
    const asset = await researchData.assetResearch("NSE:RELIANCE", bob.userId, tf, false);
    assert.equal(scanB.results.results[0].latestEventAt?.slice(0, 10), asset.candles.at(-1)?.date,
      "Scan and chart must use the same closing date for the completed candle");
    assert.ok(scanB.results.results[0].latestEventAt?.endsWith("T10:00:00.000Z"), "Use the actual NSE session close");
  }

  assert.equal(fetchCalls.length - prewarmBefore, ingressCalls, "Scan requests never perform upstream exchange calls");
  const benchmark = [];
  for (const concurrency of [1, 10, 50, 100, 250]) {
    const callStart = fetchCalls.length;
    const timings = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const started = performance.now();
      const asset = await researchData.assetResearch("NSE:RELIANCE", index % 2 ? alice.userId : bob.userId, "1d", false);
      assert.ok(asset.candles.length > 200);
      assert.equal(asset.instrument.providerSymbol, "RELIANCE");
      assert.equal(asset.provider, "Licensed exchange history");
      return performance.now() - started;
    }));
    timings.sort((a, b) => a - b);
    const p = (fraction) => Math.round(timings[Math.ceil(concurrency * fraction) - 1] * 10) / 10;
    benchmark.push({ concurrency, p50Ms: p(0.5), p95Ms: p(0.95), failures: 0,
      upstreamCalls: fetchCalls.length - callStart, cacheHits: concurrency });
    assert.equal(fetchCalls.length, callStart);
  }
  console.info("X8 shared D1 fixture benchmark", JSON.stringify(benchmark));

  assert.ok(await historyStore.readSharedHistory("NSE:RELIANCE", "1d", grants));
  const futureCutoff = historyClock - 1;
  assert.equal(await historyStore.readSharedHistory("NSE:RELIANCE", "1d", grants, { cutoff: futureCutoff }),
    null, "A snapshot received after a job cutoff cannot change that run");
  const [viewA, viewB] = await Promise.all([alice, bob].map(({ userId }) =>
    researchData.assetResearch("NSE:RELIANCE", userId, "1d", false)));
  assert.equal(viewA.retrievedAt, viewB.retrievedAt);
  assert.equal(viewA.candles.at(-1).date, viewB.candles.at(-1).date);
  sql.prepare("UPDATE x8_shared_history_task SET next_attempt=? WHERE provider='TRUEDATA'").run(historyClock);
  let authFailures = 0;
  const rejectAuthentication = async () => {
    authFailures++;
    throw new rateLimit.ProviderFailure("AUTH_FAILED", "Fixture authorization rejected");
  };
  await historyStore.refreshSharedHistory(rejectAuthentication);
  await historyStore.refreshSharedHistory(rejectAuthentication);
  assert.equal(authFailures, 1, "Authorization failure pauses the entire provider across scheduler invocations");
  assert.equal((await historyStore.sharedIngestionHealth())[0].last_error, "AUTH_FAILED");
  sql.prepare("UPDATE x2_providers SET version=2,payload=? WHERE provider='TRUEDATA'").run(
    JSON.stringify({ ...sharedProviderPayload, version: 2, enabled: false }),
  );
  assert.equal(await historyStore.readSharedHistory("NSE:RELIANCE", "1d", grants), null);
  const denied = await researchData.assetResearch("NSE:RELIANCE", bob.userId, "1d", false);
  assert.equal(denied.candles.length, 0);
  assert.equal(await researchData.canScanExchange(bob.userId, "1d", ["NSE:RELIANCE"]), false);
  sql.prepare("DELETE FROM x2_providers WHERE provider = 'TRUEDATA'").run();
  const priceConfig = { ...sharedProviderPayload, provider: "INDIANAPI", datasets: ["prices"],
    instruments: [sharedProviderPayload.instruments[0]], dailyCallLimit: 20,
    sharedHistory: { ...sharedProviderPayload.sharedHistory, intervals: ["1d"] } };
  env.INDIA_API_KEY = randomUUID();
  env.INDIA_API_HOST = "dev.indianapi.in";
  sql.prepare("INSERT INTO x2_providers (provider,version,payload,health,updated_by,updated_at,last_write) VALUES (?,?,?,?,?,?,?)")
    .run("INDIANAPI", 1, JSON.stringify(priceConfig), "{}", "owner_v3", now, "fixture-price-history");
  await historyStore.refreshSharedHistory();
  assert.equal(await researchData.canScanExchange(bob.userId, "1d", ["NSE:RELIANCE"], "INDIANAPI"), true);
  assert.equal(await researchData.canScanExchange(bob.userId, "1h", ["NSE:RELIANCE"], "INDIANAPI"), false);
  const requested = { provider: "INDIANAPI", instrumentIds: ["NSE:RELIANCE"], interval: "1d", eventCutoff: now };
  const snapshot = await researchData.researchUniverse(bob.userId, requested);
  assert.deepEqual(Array.from(snapshot.datasets[0].observations, (point) => point.close), [99, 101, 105]);
  assert.equal(snapshot.datasets[0].observations[0].high, undefined);
  assert.equal(snapshot.datasets[0].observations[0].volume, undefined);
  assert.equal(snapshot.lineage[0].provider, "INDIANAPI");
  delete env.INDIA_API_KEY;
  assert.equal(await researchData.canScanExchange(bob.userId, "1d", ["NSE:RELIANCE"], "INDIANAPI"), false);
  sql.prepare("DELETE FROM x2_providers WHERE provider='INDIANAPI'").run();
  historyClock = null;
});

test("V3 S04/S08: Genuine 1h completed-session boundaries (NSE 15:15–15:30 terminal bar, MCX DST, developing bar exclusion, no daily->1h synthesis) & Classic/Advanced equivalence", () => {
  // 1. NSE terminal 15:15 IST bar completes cleanly at 15:30 IST (15 minutes)
  const nse1515 = Date.parse("2026-11-23T15:15:00+05:30");
  const nseClose = scanHistoryMod.hourlyBarCloseMs("NSE", nse1515);
  assert.equal(nseClose, Date.parse("2026-11-23T15:30:00+05:30"));

  // 2. NSE pre-open (09:00 IST) and post-close (15:30 IST) rejected
  assert.equal(scanHistoryMod.hourlyBarCloseMs("NSE", Date.parse("2026-11-23T09:00:00+05:30")), null);
  assert.equal(scanHistoryMod.hourlyBarCloseMs("NSE", Date.parse("2026-11-23T15:30:00+05:30")), null);

  // 3. MCX DST-aware close (Nov winter -> 23:55 IST; Jul summer -> 23:30 IST)
  const mcxWinter23 = Date.parse("2026-11-23T23:00:00+05:30");
  assert.equal(scanHistoryMod.hourlyBarCloseMs("MCX", mcxWinter23), Date.parse("2026-11-23T23:55:00+05:30"));
  const mcxSummer23 = Date.parse("2026-07-15T23:00:00+05:30");
  assert.equal(scanHistoryMod.hourlyBarCloseMs("MCX", mcxSummer23), Date.parse("2026-07-15T23:30:00+05:30"));

  // 4. Never synthesizes 1h bars from date-only daily rows AND excludes developing bars
  const retrievalIso = "2026-11-23T11:30:00+05:30"; // 11:15 bar still developing until 12:15!
  const mixedCandles = [
    { date: "2026-11-20", open: 100, high: 105, low: 99, close: 104, volume: 1000 }, // daily-only -> MUST REJECT
    { date: "2026-11-23T09:15:00+05:30", open: 104, high: 106, low: 103, close: 105, volume: 1000 }, // closed 10:15 -> KEEP
    { date: "2026-11-23T10:15:00+05:30", open: 105, high: 107, low: 104, close: 106, volume: 1000 }, // closed 11:15 -> KEEP
    { date: "2026-11-23T11:15:00+05:30", open: 106, high: 108, low: 105, close: 107, volume: 1000 }, // developing -> EXCLUDE
  ];
  const obs = scanHistoryMod.completedCommercialIntradayObservations(mixedCandles, "NSE", retrievalIso);
  assert.equal(obs.length, 2, "Only completed 1h session bars may survive; daily-only and developing bars must be excluded");

  // 5. Classic vs Advanced rule equivalence & crossing semantics
  const bars = Array.from({ length: 25 }, (_, i) => ({
    eventAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    knownAt: `2026-10-${String(i + 1).padStart(2, "0")}T18:00:00.000Z`,
    close: i < 24 ? 100 : 120,
    open: 100,
    high: i < 24 ? 101 : 121,
    low: 99,
    volume: 10000,
  }));
  const dataset = {
    instrumentId: "NSE:DEMO",
    currency: "INR",
    source: "Test",
    permitted: true,
    frequency: "DAILY",
    observations: bars,
  };
  const classicRule = scanEngineMod.compileFormula("crossesabove(close, sma(close, 5))");
  const advRule = scanEngineMod.compileFormula("all(crossesabove(close, sma(close, 5)))");
  const rClassic = scanEngineMod.evaluateScan(classicRule, [dataset], "2026-11-01T00:00:00.000Z");
  const rAdv = scanEngineMod.evaluateScan(advRule, [dataset], "2026-11-01T00:00:00.000Z");
  assert.equal(rClassic.matches, 1);
  assert.equal(rAdv.matches, 1);
  assert.deepEqual(
    [...rClassic.results.map((r) => [r.instrumentId, r.status])],
    [...rAdv.results.map((r) => [r.instrumentId, r.status])],
  );
});

// ---------------------------------------------------------------------------
// 2. V2 P01–P05: Strict 8-Tile Allowlist, Legacy 9-Card Reconciliation, Pins, Banners
// ---------------------------------------------------------------------------
test("V2 P01/P03/P05: Strict 8-tile Global allowlist reconciles legacy 9-card layouts; zero Angel One in /api/release; D1 pins & dual banners isolated", async () => {
  const userA = await registerUser("pin_a@example.test", "StrongPass123!fixture", "Pin User A");
  const userB = await registerUser("pin_b@example.test", "StrongPass456!fixture", "Pin User B");

  // 1. Seed legacy 9-card D1 layout with removed SPX/NDX/N225/BRENT/XAUUSD/XAGUSD
  const nowIso = new Date().toISOString();
  sql
    .prepare(
      `INSERT OR REPLACE INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
       VALUES (?, ?, 'market-layout-9', 'Global Markets Layout', ?, 3, 0, 'legacy_9_card_seed', ?, ?)`,
    )
    .run(
      "market-layout:" + userA.userId,
      userA.userId,
      JSON.stringify({
        ids: [
          "GLOBAL:SPX", "NSE:NIFTY", "GLOBAL:NDX", "BSE:SENSEX",
          "GLOBAL:N225", "GLOBAL:XAUUSD", "GLOBAL:XAGUSD", "GLOBAL:BRENT", "ECB:USDINR",
        ],
      }),
      nowIso,
      nowIso,
    );

  const ovRes = await overviewRoute.GET(req("/api/markets/overview", "GET", undefined, userA.cookie));
  assert.equal(ovRes.status, 200);
  const ov = await ovRes.json();
  assert.equal(ov.cards.length, 8, "Legacy 9-card layout must reconcile cleanly into strict 8-tile allowlist");
  assert.ok(!ov.cards.some((c) => ["GLOBAL:SPX", "GLOBAL:NDX", "GLOBAL:N225", "GLOBAL:BRENT", "GLOBAL:XAUUSD", "GLOBAL:XAGUSD"].includes(c.canonicalId)));
  assert.deepEqual(
    ov.cards.map((c) => c.canonicalId).sort(),
    [...nineCardMod.DEFAULT_EIGHT_CARD_IDS].sort(),
  );
  assert.doesNotMatch(JSON.stringify(ov), /angel\s*one|smartapi/i);

  // 2. /api/release has zero Angel One / angelone leaks and exposes unified V3 release + support email
  const relRes = await releaseRoute.GET(req("/api/release"));
  const relText = await relRes.text();
  assert.doesNotMatch(relText, /angel\s*one|smartapi|angelone/i);
  const relJson = JSON.parse(relText);
  assert.equal(relJson.supportEmail, "strategicsoulsgvv@gmail.com");

  // 3. Per-user D1 Formula Pinning + cross-user isolation + invalid ID rejection
  const firstClassicId = classicPresetsMod.CLASSIC_50_PRESETS[0].id;
  await assert.rejects(
    () => workspaceMod.mutateWorkspace(userA.userId, { action: "pin-formula", formulaId: "not_a_real_formula" }),
    /Choose a valid Classic formula/i,
  );
  const pinRes = await workspaceMod.mutateWorkspace(userA.userId, {
    action: "pin-formula",
    formulaId: firstClassicId,
  });
  assert.equal(pinRes.pinned, true);
  assert.ok(pinRes.pinnedFormulaIds.includes(firstClassicId));

  const stateA = await workspaceMod.workspaceState(userA.userId);
  const stateB = await workspaceMod.workspaceState(userB.userId);
  assert.deepEqual([...stateA.pinnedFormulaIds], [firstClassicId]);
  assert.deepEqual([...stateB.pinnedFormulaIds], []);

  // Unpin cleanly
  const unpinRes = await workspaceMod.mutateWorkspace(userA.userId, {
    action: "unpin-formula",
    formulaId: firstClassicId,
  });
  assert.equal(unpinRes.pinned, false);
  assert.deepEqual([...unpinRes.pinnedFormulaIds], []);

  // 4. Independent Portfolio (p01–p08) vs Profile (b01–b08) banners
  const authA = { userId: userA.userId, displayName: "Pin User A", email: userA.email, authProvider: "email" };
  await profileMod.mutatePrivateProfile(authA, {
    action: "update-profile",
    displayName: "Pin User A",
    bannerPresetId: "b04",
  });
  await profileMod.mutatePrivateProfile(authA, {
    action: "update-preferences",
    portfolioBackdrop: { presetId: "p06", position: "bottom", overlay: 0.7, blur: 0 },
  });
  const profA = await profileMod.getPrivateProfile(authA);
  assert.equal(profA.bannerPresetId, "b04");
  assert.equal(profA.portfolioBackdrop.presetId, "p06");

  // Changing Profile banner again must NOT disturb Portfolio backdrop
  await profileMod.mutatePrivateProfile(authA, {
    action: "update-profile",
    displayName: "Pin User A",
    bannerPresetId: "b07",
  });
  const profA2 = await profileMod.getPrivateProfile(authA);
  assert.equal(profA2.bannerPresetId, "b07");
  assert.equal(profA2.portfolioBackdrop.presetId, "p06");
});

// ---------------------------------------------------------------------------
// 3. V2 P17: Truthful Soul Post Metrics (Likes, Views, Shares) & Author-Only Insights
// ---------------------------------------------------------------------------
test("V2 P17: Soul Post Likes, Daily-Dedup Views (self-view excluded), Shares & strictly author-only Insights", async () => {
  const author = await registerUser("author_v3@example.test", "StrongPass123!fixture", "Author V3");
  const reader = await registerUser("reader_v3@example.test", "StrongPass456!fixture", "Reader V3");

  await profileMod.mutatePrivateProfile(
    { userId: author.userId, displayName: "Author V3", email: author.email, authProvider: "email" },
    { action: "update-profile", displayName: "Author V3", handle: "author_v3" },
  );
  await profileMod.mutatePrivateProfile(
    { userId: reader.userId, displayName: "Reader V3", email: reader.email, authProvider: "email" },
    { action: "update-profile", displayName: "Reader V3", handle: "reader_v3" },
  );

  // Seed a published PUBLIC Soul post directly tied to a completed scan
  const now = new Date().toISOString();
  const postId = "post_v3_metrics_1";
  sql
    .prepare(
      `INSERT INTO x51_web_souls
         (id, author_subject, author_handle, scan_id, soul_version, mode, title, summary, formula, blueprint_json, timeframe, universe_label, matched_symbols_json, evidence_status, source_attribution, risk_note, audience, group_id, idempotency_key, pinned, source_digest, created_at)
       VALUES (?, ?, 'author_v3', 'scan_pub_1', 1, 'CLASSIC', 'RSI Pullback', 'Clean setup', 'rsi(close, 14) < 35', '{}', '1d', 'Market', '["NSE:RELIANCE"]', 'Completed scan', 'Shared Market Feed', 'Educational only', 'PUBLIC', NULL, 'rk_pub_1', 0, 'digest123', ?)`,
    )
    .run(postId, author.userId, now);

  // Author self-view MUST NOT count
  const selfView = await networkRoute.POST(
    req("/api/community/network", "POST", { action: "record-view", postId }, author.cookie),
  );
  assert.equal(selfView.status, 200);
  const selfViewJson = await selfView.json();
  assert.equal(selfViewJson.recorded, false);
  assert.equal(selfViewJson.viewCount, 0);

  // Reader first view counts; duplicate same-day view deduplicates cleanly
  const v1 = await networkRoute.POST(
    req("/api/community/network", "POST", { action: "record-view", postId }, reader.cookie),
  );
  const v1Json = await v1.json();
  assert.equal(v1Json.recorded, true);
  assert.equal(v1Json.viewCount, 1);

  const v2 = await networkRoute.POST(
    req("/api/community/network", "POST", { action: "record-view", postId }, reader.cookie),
  );
  const v2Json = await v2.json();
  assert.equal(v2Json.recorded, false);
  assert.equal(v2Json.viewCount, 1);

  // Reader likes, saves, and shares
  const likeRes = await networkRoute.POST(
    req("/api/community/network", "POST", { action: "like-post", postId, active: true }, reader.cookie),
  );
  assert.equal((await likeRes.json()).likeCount, 1);

  const shareRes = await networkRoute.POST(
    req("/api/community/network", "POST", { action: "record-share", postId, channel: "COPY" }, reader.cookie),
  );
  assert.equal((await shareRes.json()).shareCount, 1);

  // Non-author gets 403 on Post Insights; guest gets 401
  const nonAuthorInsights = await networkRoute.GET(
    req(`/api/community/network?view=insights&postId=${postId}`, "GET", undefined, reader.cookie),
  );
  assert.equal(nonAuthorInsights.status, 403);

  const guestInsights = await networkRoute.GET(
    req(`/api/community/network?view=insights&postId=${postId}`),
  );
  assert.equal(guestInsights.status, 401);

  // Author gets exact real Insights without viewer identities
  const authorInsightsRes = await networkRoute.GET(
    req(`/api/community/network?view=insights&postId=${postId}`, "GET", undefined, author.cookie),
  );
  assert.equal(authorInsightsRes.status, 200);
  const authorInsightsText = await authorInsightsRes.text();
  assert.doesNotMatch(authorInsightsText, new RegExp(reader.userId));
  const { insights } = JSON.parse(authorInsightsText);
  assert.equal(insights.views, 1);
  assert.equal(insights.likes, 1);
  assert.equal(insights.shares, 1);
  assert.equal(insights.engagementRatePct, 200); // (1 like + 1 share) / 1 view * 100
});

// ---------------------------------------------------------------------------
// 4. V2 P09: Password Change, Non-Enumerating Reset, Email Verification, Active Sessions
// ---------------------------------------------------------------------------
test("V2 P09: Password change, non-enumerating single-use reset, email change verification, and Active Sessions revocation", async () => {
  const sentEmails = [];
  emailTransport.setTestSecurityEmailTransport(async (msg) => {
    sentEmails.push(msg);
    return { delivered: true, configured: true, provider: "test" };
  });

  try {
    const user = await registerUser("sec_v3@example.test", "InitialPass123!", "Security Tester");
    const otherUser = await registerUser("other_v3@example.test", "OtherPass123!fixture", "Other Tester");

    // Sign in from a second device ("Firefox on Linux")
    const signIn2 = await authRoute.POST(
      req(
        "/api/auth/signin",
        "POST",
        { email: user.email, password: user.password },
        "",
        { "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0" },
      ),
    );
    assert.equal(signIn2.status, 200);
    const secondCookie = cookieFrom(signIn2);

    // List Active Sessions: 2 sessions, safe device labels, ZERO raw cookie / token_hash leaks
    const sessRes = await authRoute.GET(req("/api/auth/sessions", "GET", undefined, secondCookie));
    assert.equal(sessRes.status, 200);
    const sessRaw = await sessRes.text();
    assert.doesNotMatch(sessRaw, /__ss_session/);
    const { sessions } = JSON.parse(sessRaw);
    assert.equal(sessions.length, 2);
    assert.ok(sessions.some((s) => s.isCurrent && s.deviceLabel === "Firefox on Linux"));
    assert.ok(sessions.some((s) => !s.isCurrent && s.deviceLabel === "Chrome on Windows"));

    // Cross-user session revocation MUST fail with 404
    const victimSessionId = sessions[0].id;
    const idorRevoke = await authRoute.POST(
      req("/api/auth/sessions/revoke", "POST", { sessionId: victimSessionId }, otherUser.cookie),
    );
    assert.equal(idorRevoke.status, 404);

    // Change Password rejects wrong current password (401), then succeeds, rotates current cookie & revokes other sessions
    const badChange = await authRoute.POST(
      req(
        "/api/auth/change-password",
        "POST",
        { currentPassword: "WrongPassword1!", newPassword: "NewStrongPass99!" },
        secondCookie,
      ),
    );
    assert.equal(badChange.status, 401);

    const okChange = await authRoute.POST(
      req(
        "/api/auth/change-password",
        "POST",
        { currentPassword: user.password, newPassword: "NewStrongPass99!" },
        secondCookie,
      ),
    );
    assert.equal(okChange.status, 200);
    const rotatedCookie = cookieFrom(okChange);
    assert.ok(rotatedCookie && rotatedCookie !== secondCookie);

    // First device session MUST now be revoked (session endpoint returns authenticated:false)
    const oldSessionCheck = await authRoute.GET(req("/api/auth/session", "GET", undefined, user.cookie));
    assert.equal((await oldSessionCheck.json()).authenticated, false);

    // Email change requires current password reauth & does NOT change email until token confirmed
    const reqEmail = await authRoute.POST(
      req(
        "/api/auth/request-email-change",
        "POST",
        { currentPassword: "NewStrongPass99!", newEmail: "sec_v3_verified@example.test" },
        rotatedCookie,
      ),
    );
    assert.equal(reqEmail.status, 200);
    const emailMsg = sentEmails.find((m) => m.purpose === "EMAIL_VERIFY");
    assert.ok(emailMsg && emailMsg.token.length >= 32);

    // Still old email before confirmation
    assert.equal(
      sql.prepare("SELECT email FROM auth_users WHERE id = ?").get(user.userId).email,
      "sec_v3@example.test",
    );

    const confirmEmail = await authRoute.POST(
      req("/api/auth/confirm-email-change", "POST", { token: emailMsg.token }, rotatedCookie),
    );
    assert.equal(confirmEmail.status, 200);
    assert.equal(
      sql.prepare("SELECT email FROM auth_users WHERE id = ?").get(user.userId).email,
      "sec_v3_verified@example.test",
    );

    // Forgot Password: non-enumerating response for unknown vs known email, never returns raw token in HTTP body
    const unknownFp = await authRoute.POST(
      req("/api/auth/forgot-password", "POST", { email: "nobody_here@example.test" }),
    );
    const knownFp = await authRoute.POST(
      req("/api/auth/forgot-password", "POST", { email: "sec_v3_verified@example.test" }),
    );
    assert.equal(unknownFp.status, 200);
    assert.equal(knownFp.status, 200);
    const unknownBody = await unknownFp.json();
    const knownBody = await knownFp.json();
    assert.equal(unknownBody.message, knownBody.message);

    const resetMsg = sentEmails.find((m) => m.purpose === "PASSWORD_RESET");
    assert.ok(resetMsg && resetMsg.token.length >= 32);
    assert.doesNotMatch(JSON.stringify(knownBody), new RegExp(resetMsg.token));

    // Complete password reset -> consumes token atomically and revokes ALL sessions
    const resetOk = await authRoute.POST(
      req("/api/auth/reset-password", "POST", {
        token: resetMsg.token,
        newPassword: "RecoveredPass777!",
      }),
    );
    assert.equal(resetOk.status, 200);

    // Single-use replay MUST fail with 400
    const resetReplay = await authRoute.POST(
      req("/api/auth/reset-password", "POST", {
        token: resetMsg.token,
        newPassword: "ReplayPass888!",
      }),
    );
    assert.equal(resetReplay.status, 400);

    // Active session before reset MUST be revoked
    const revokedAfterReset = await authRoute.GET(req("/api/auth/session", "GET", undefined, rotatedCookie));
    assert.equal((await revokedAfterReset.json()).authenticated, false);

    // Can sign in with recovered password
    const finalSignIn = await authRoute.POST(
      req("/api/auth/signin", "POST", {
        email: "sec_v3_verified@example.test",
        password: "RecoveredPass777!",
      }),
    );
    assert.equal(finalSignIn.status, 200);
  } finally {
    emailTransport.setTestSecurityEmailTransport(null);
  }
});

// ---------------------------------------------------------------------------
// 5. GVV Logo Integrity & Zero User-Visible "optional" / Vendor Leak Static Gate
// ---------------------------------------------------------------------------
test("V2/V3 Asset & Copy Invariants: GVV logo SHA-256 unchanged, zero user-visible 'optional' or 'Angel One' in active UI", () => {
  const logoBytes = readFileSync(resolve(root, "public/gvv-approved.jpg"));
  const sha = createHash("sha256").update(logoBytes).digest("hex").toUpperCase();
  assert.equal(
    sha,
    "7512003E8E05BF88C75ECB1B62B418000D61B9D4EEDD560531017BC002288FAB",
    "GVV approved logo must remain byte-identical",
  );

  const activeUiFiles = [
    "frontend/components/workspace/workspace.tsx",
    "frontend/features/global/market-grid.tsx",
    "frontend/features/global/dashboard.tsx",
    "frontend/features/global/portfolio-allocation.tsx",
    "frontend/features/strategy/workspace.tsx",
    "frontend/features/community/research-network-shell.tsx",
    "frontend/features/community/public-profile-sheet.tsx",
    "frontend/features/account/settings-view.tsx",
    "frontend/features/auth/auth-panel.tsx",
  ];
  for (const f of activeUiFiles) {
    const raw = readFileSync(resolve(root, f), "utf8");
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "")
      .replace(/className="[^"]*"/g, "");
    assert.doesNotMatch(stripped, /\boptional\b/i, `${f} must not contain user-visible "optional"`);
    assert.doesNotMatch(stripped, /Angel One|SmartAPI/i, `${f} must not contain Angel One or SmartAPI`);
  }
});
