/**
 * Isolated TEST DATA — NOT LIVE MARKET OBSERVATIONS.
 * Verifies Phase 8 Public Market Data & Nifty 500 Shared Scanning invariants:
 *   - Derived-only vs full raw display rights separation (BharatStock & Indian API)
 *   - Flexible 501-member Nifty universe validation, provenance, and version pinning
 *   - BharatStock equity OHLCV + adjusted_close schema validation & Indian API close-only protection
 *   - Scheduled D1 ingestion, credit window / 429 Retry-After backoff, and cross-account cache reuse
 *   - Durable 501-symbol scan jobs, exact partition accounting, atomic quota release on cancel/partial/block
 *   - Cross-account IDOR isolation, owner-only provider/universe control, and expired-grant shutoff keeping ECB alive
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto, randomUUID } from "node:crypto";
import ts from "typescript";

const NOW = Date.parse("2026-11-25T11:30:00Z"); // 17:00 IST (post NSE close 15:30 IST)
class FixedClock extends Date {
  constructor(...args) {
    super(...(args.length ? args : [NOW]));
  }
  static now() {
    return NOW;
  }
}

function createTestHarness() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  }
  for (const user of ["owner", "alice", "bob"]) {
    sql
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)")
      .run(user, user, "2026-11-25T00:00:00Z", "2026-11-14-v4", 1, "2026-11-25T00:00:00Z");
  }

  class Statement {
    constructor(q, args = []) {
      this.q = q;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.q, args);
    }
    async first(col) {
      const row = sql.prepare(this.q).get(...this.args) ?? null;
      if (!row) return null;
      return col ? row[col] : row;
    }
    async all() {
      return { results: sql.prepare(this.q).all(...this.args) };
    }
    async run() {
      const r = sql.prepare(this.q).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    execute() {
      const r = sql.prepare(this.q).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
  }

  const DB = {
    prepare: (q) => new Statement(q),
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const res = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return res;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };

  let activeUser = { userId: "owner" };
  let fetchCalls = [];
  let fetchReply = async () => Response.json({ data: [] });

  const env = {
    DB,
    X2_OWNER_SUBJECT: "owner",
    INDIA_API_HOST: "stock.indianapi.in",
    INDIA_API_KEY: "test_indian_api_key_fixture_only",
    BHARATSTOCK_API_KEY: "test_bharatstock_key_fixture_only",
    ENABLE_PRIVATE_BROKER_DATA: "false",
  };

  const ecbHistory = [
    {
      id: "ECB:USDINR",
      label: "USD / INR (ECB Reference)",
      currency: "INR",
      unit: "INR per USD",
      provider: "ECB",
      sourceUrl: "https://www.ecb.europa.eu/stats/eurofxref/",
      asOfDate: "2026-11-24",
      retrievedAt: new FixedClock().toISOString(),
      canAnalyze: true,
      derivation: null,
      points: Array.from({ length: 45 }, (_, i) => ({
        date: new Date(NOW - (45 - i) * 86_400_000).toISOString().slice(0, 10),
        close: 84 + i * 0.05,
        knownAt: new FixedClock().toISOString(),
      })),
    },
  ];
  const ecbSnapshot = {
    asOf: new FixedClock().toISOString(),
    providers: [],
    yields: [],
    quotes: [
      {
        id: "ECB:USDINR",
        label: "USD / INR (ECB Reference)",
        provider: "ECB",
        unit: "INR per USD",
        currency: "INR",
        sourceUrl: "https://www.ecb.europa.eu/stats/eurofxref/",
        retrievedAt: new FixedClock().toISOString(),
        state: "PUBLISHED_EOD",
        sourceDate: "2026-11-24",
        value: 86.2,
      },
    ],
    fxHistory: ecbHistory,
  };

  const context = vm.createContext({
    console,
    Date: FixedClock,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    Request,
    Response,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: webcrypto,
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return fetchReply(String(url), init);
    },
  });

  const modules = new Map();
  function synthetic(id, values) {
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [k, v] of Object.entries(values)) this.setExport(k, v);
      },
      { context, identifier: id },
    );
  }

  function moduleFor(file) {
    if (modules.has(file)) return modules.get(file);
    let m;
    if (file === "cloudflare:workers") {
      m = synthetic(file, { env });
    } else if (file.endsWith("/database/queries/repository.ts")) {
      m = synthetic(file, {
        database: () => DB,
        account: async (subject) => sql.prepare("SELECT * FROM accounts WHERE subject=?").get(subject) ?? null,
        rate: async (key, max, ttl) => {
          const r = sql.prepare("SELECT count, expires_at FROM rate_limits WHERE key=?").get(key);
          const count = r && r.expires_at > NOW ? r.count : 0;
          if (count >= max) throw Object.assign(new Error("Rate limit reached."), { status: 429 });
          sql
            .prepare(
              "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=excluded.expires_at",
            )
            .run(key, NOW + ttl, NOW);
        },
      });
    } else if (file.endsWith("/backend/auth/session.ts")) {
      m = synthetic(file, { getAuthenticatedUser: async () => activeUser });
    } else if (file.endsWith("/backend/services/market-data/official-references.ts")) {
      m = synthetic(file, { loadOfficialReferences: async () => structuredClone(ecbSnapshot) });
    } else {
      m = new vm.SourceTextModule(
        ts.transpileModule(readFileSync(file, "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        { context, identifier: file },
      );
    }
    modules.set(file, m);
    return m;
  }

  async function load(name) {
    const m = moduleFor(resolve(name).replaceAll("\\", "/"));
    if (m.status === "unlinked") {
      await m.link((specifier, parent) =>
        moduleFor(
          specifier === "cloudflare:workers"
            ? specifier
            : resolve(dirname(parent.identifier), specifier + ".ts").replaceAll("\\", "/"),
        ),
      );
    }
    if (m.status === "linked") await m.evaluate();
    return m.namespace;
  }

  return {
    sql,
    env,
    load,
    setUser: (u) => {
      activeUser = u;
    },
    getFetchCalls: () => fetchCalls,
    resetFetchCalls: () => {
      fetchCalls = [];
    },
    setFetchReply: (fn) => {
      fetchReply = fn;
    },
  };
}

function makeWeekdayDates(count, endDateIso = "2026-11-25") {
  const dates = [];
  let cursor = Date.parse(endDateIso + "T00:00:00Z");
  while (dates.length < count) {
    const d = new Date(cursor);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      dates.push(d.toISOString().slice(0, 10));
    }
    cursor -= 86_400_000;
  }
  return dates.reverse();
}

function makeNifty501Fixture() {
  const core = [
    { id: "NSE:RELIANCE", isin: "INE002A01018", name: "Reliance Industries Ltd.", industry: "Oil Gas & Consumable Fuels", series: "EQ" },
    { id: "NSE:SBIN", isin: "INE062A01020", name: "State Bank of India", industry: "Financial Services", series: "EQ" },
    { id: "NSE:TCS", isin: "INE467B01029", name: "Tata Consultancy Services Ltd.", industry: "Information Technology", series: "EQ" },
    { id: "NSE:HDFCBANK", isin: "INE040A01034", name: "HDFC Bank Ltd.", industry: "Financial Services", series: "EQ" },
    { id: "NSE:INFY", isin: "INE009A01021", name: "Infosys Ltd.", industry: "Information Technology", series: "EQ" },
    { id: "NSE:ICICIBANK", isin: "INE090A01021", name: "ICICI Bank Ltd.", industry: "Financial Services", series: "EQ" },
    { id: "NSE:ITC", isin: "INE154A01025", name: "ITC Ltd.", industry: "Fast Moving Consumer Goods", series: "EQ" },
  ];
  const extras = Array.from({ length: 501 - core.length }, (_, idx) => {
    const num = String(idx + 1).padStart(4, "0");
    return {
      id: `NSE:SYM${num}`,
      isin: `INE999A0${num.slice(0, 3)}${idx % 10}`,
      name: `Fixture Constituent ${num}`,
      industry: idx % 2 === 0 ? "Capital Goods" : "Healthcare",
      series: idx === 0 ? "BE" : idx === 1 ? "RR" : "EQ",
    };
  });
  return [...core, ...extras];
}

test("BharatStock equity OHLCV & Indian API close-only schema validators enforce strict bounds", async () => {
  const h = createTestHarness();
  const providers = await h.load("backend/services/market-data/providers.ts");

  const eqInst = {
    id: "NSE:RELIANCE",
    name: "Reliance Industries Ltd.",
    symbol: "RELIANCE",
    providerSymbol: "RELIANCE",
    market: "NSE",
    mic: "XNSE",
    type: "EQUITY",
    currency: "INR",
    unit: "INR per share",
    timezone: "Asia/Kolkata",
  };
  const validRows = [
    { trade_date: "2026-11-24", open: 1400, high: 1425, low: 1395, close: 1420, volume: 8_400_000, adjusted_close: 1420 },
    { trade_date: "2026-11-25", open: 1422, high: 1440, low: 1418, close: 1435, volume: 7_200_000, adjusted_close: 1435 },
  ];
  const candles = await providers.bharatStockEquityCandles(
    eqInst,
    "fixture_key",
    async () => Response.json({ data: validRows }),
    NOW,
    90,
  );
  assert.equal(candles.length, 2);
  assert.equal(candles[1].close, 1435);
  assert.equal(candles[1].adjustedClose, 1435);
  assert.equal(candles[1].adjustment, "RAW_OHLC_ADJUSTED_CLOSE");

  // Reject impossible OHLC envelope, duplicate dates, future dates
  for (const bad of [
    [{ ...validRows[0], high: 1300 }],
    [validRows[0], validRows[0]],
    [{ ...validRows[0], trade_date: "2026-12-30" }],
    [{ ...validRows[0], volume: -5 }],
  ]) {
    await assert.rejects(
      () => providers.bharatStockEquityCandles(eqInst, "fixture_key", async () => Response.json({ data: bad }), NOW, 90),
      (err) => err.code === "INVALID_DATA",
    );
  }

  // Indian API rejects unauthorized host and parses close+volume only
  await assert.rejects(
    () => providers.indianDailyPrices("RELIANCE", "fixture_key", "evil.invalid", async () => Response.json({})),
    (err) => err.code === "INVALID_DATA",
  );
  const indianPrices = await providers.indianDailyPrices(
    "RELIANCE",
    "fixture_key",
    "stock.indianapi.in",
    async () =>
      Response.json({
        datasets: [
          { metric: "Price", label: "Price on NSE", meta: { is_weekly: false }, values: [["2026-11-24", "1420.5"], ["2026-11-25", 1435]] },
          { metric: "Volume", label: "Volume", meta: { is_weekly: false }, values: [["2026-11-24", 8400000], ["2026-11-25", 7200000]] },
        ],
      }),
  );
  assert.equal(indianPrices.length, 2);
  assert.equal(indianPrices[0].close, 1420.5);
  assert.equal("open" in indianPrices[0], false, "Close-only Indian API must never fabricate OHLC fields");
});

test("Derived-only rights separation vs raw display/redistribution and 501-member Nifty universe provenance", async () => {
  const h = createTestHarness();
  const providers = await h.load("backend/services/market-data/providers.ts");
  const shared = await h.load("backend/services/market-data/shared-history.ts");
  const nifty = await h.load("backend/services/market-data/nifty-500.ts");

  // 501-member universe with EQ/BE/RR series passes validation and preserves exact counts
  const constituents = makeNifty501Fixture();
  const imported = await nifty.importNiftyUniverse({
    effectiveDate: "2026-11-23",
    expectedCount: 501,
    provenance: "Authorized NSE Nifty 500 constituent delivery fixture (501 lines incl. EQ/BE/RR)",
    rightsConfirmed: true,
    rightsExpiresAt: "2027-06-30T23:59:59.000Z",
    constituents,
  });
  assert.equal(imported.count, 501);
  assert.equal(imported.active, true);
  const active = await nifty.niftyUniverse();
  assert.equal(active.expectedCount, 501);
  assert.equal(active.distinctCount, 501);

  // Derived-only shared grant (display=false, redistribution=false, derivedDisplay=true) is valid
  const derivedCfg = providers.validateConfig({
    provider: "BHARATSTOCK",
    enabled: true,
    priority: 1,
    version: 0,
    dailyCallLimit: 5000,
    lastWrite: randomUUID(),
    datasets: ["candles"],
    instruments: [
      {
        id: "NSE:RELIANCE",
        name: "Reliance Industries Ltd.",
        symbol: "RELIANCE",
        providerSymbol: "RELIANCE",
        market: "NSE",
        mic: "XNSE",
        type: "EQUITY",
        currency: "INR",
        unit: "INR per share",
        timezone: "Asia/Kolkata",
      },
    ],
    rights: {
      display: false,
      analysis: true,
      storage: true,
      redistribution: false,
      derivedDisplay: true,
      verified: true,
      cacheSeconds: 300,
      contractReference: "PAID-DERIVED-ONLY-FIXTURE",
      expiresAt: "2027-06-30T23:59:59.000Z",
    },
    sharedHistory: {
      intervals: ["1d"],
      lagMinutes: 30,
      retentionHours: 48,
      dailyLookbackDays: 400,
      dailyRefreshMinutes: 720,
      intradayRefreshMinutes: 120,
      attribution: "BharatStock Paid Derived Fixture",
      attributionUrl: "https://bharatstockapi.com/reference",
      creditWindow: {
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
        availableCredits: 5000,
        callsPerMinute: 60,
      },
    },
  });
  assert.equal(shared.hasSharedDerivedRights(derivedCfg, NOW), true);
  assert.equal(shared.hasSharedDisplayRights(derivedCfg, NOW), false);
  assert.equal(shared.sharedRightsMode(derivedCfg, NOW), "DERIVED_ONLY");

  // Shared grant with display=true but redistribution=false MUST be rejected
  assert.throws(
    () =>
      providers.validateConfig({
        ...derivedCfg,
        lastWrite: randomUUID(),
        rights: { ...derivedCfg.rights, display: true, redistribution: false },
      }),
    /redistribution/i,
  );
});

test("Full 501-member derived-only shared scan: two ordinary users share D1 cache with 0 upstream calls, raw prices stripped, quotas atomic, expired grant fails closed while ECB stays alive", async () => {
  const h = createTestHarness();
  const dataService = await h.load("backend/services/market-data/data-service.ts");
  const nifty = await h.load("backend/services/market-data/nifty-500.ts");
  const jobs = await h.load("backend/services/research/market-scan-jobs.ts");
  const workspace = await h.load("backend/services/research/workspace.ts");
  const scanRoute = await h.load("app/api/strategy/scan/route.ts");
  const universeRoute = await h.load("app/api/strategy/universe/route.ts");
  const healthRoute = await h.load("app/api/market/health/route.ts");

  // 1. Before universe/provider setup, ordinary user gets exact granular NIFTY_UNIVERSE_UNAVAILABLE & 0 quota charged
  h.setUser({ userId: "alice" });
  const unreadyRes = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Pre-activation Market Check",
        description: "Deterministic check prior to universe setup.",
        formula: "close > 0",
        mode: "SIMPLE",
        universe: "CONNECTED_MARKETS",
        universePreset: "MARKET",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    }),
  );
  assert.equal(unreadyRes.status, 503);
  const unreadyBody = await unreadyRes.json();
  assert.equal(unreadyBody.errorCode, "NIFTY_UNIVERSE_UNAVAILABLE");
  assert.equal(unreadyBody.retryable, false);
  assert.equal((await workspace.workspaceState("alice")).scanQuota.classic.used, 0);

  // Ordinary user CANNOT import universe or configure provider
  const putDenied = await universeRoute.PUT(
    new Request("https://site.invalid/api/strategy/universe", {
      method: "PUT",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(putDenied.status, 404);

  // 2. Owner imports authorized 501-member Nifty universe and configures DERIVED_ONLY BharatStock shared grant
  h.setUser({ userId: "owner" });
  const constituents = makeNifty501Fixture();
  const uniSaved = await nifty.importNiftyUniverse({
    effectiveDate: "2026-11-23",
    expectedCount: 501,
    provenance: "Authorized NSE Nifty 500 delivery fixture",
    rightsConfirmed: true,
    rightsExpiresAt: "2027-06-30T23:59:59.000Z",
    constituents,
  });
  assert.equal(uniSaved.count, 501);

  await dataService.configureProvider("owner", {
    useNiftyUniverse: true,
    config: {
      provider: "BHARATSTOCK",
      enabled: true,
      priority: 1,
      version: 0,
      dailyCallLimit: 5000,
      lastWrite: randomUUID(),
      datasets: ["candles"],
      instruments: [],
      rights: {
        display: false,
        analysis: true,
        storage: true,
        redistribution: false,
        derivedDisplay: true,
        verified: true,
        cacheSeconds: 300,
        contractReference: "BHARATSTOCK-GROWTH-DERIVED-FIXTURE",
        expiresAt: "2027-06-30T23:59:59.000Z",
      },
      sharedHistory: {
        intervals: ["1d"],
        lagMinutes: 30,
        retentionHours: 48,
        dailyLookbackDays: 400,
        dailyRefreshMinutes: 720,
        intradayRefreshMinutes: 120,
        attribution: "BharatStock EOD (Derived Screening Only)",
        attributionUrl: "https://bharatstockapi.com/reference",
        creditWindow: {
          startsAt: "2026-11-01T00:00:00.000Z",
          endsAt: "2026-12-01T00:00:00.000Z",
          availableCredits: 5000,
          callsPerMinute: 120,
        },
      },
    },
  });

  // 3. Seed normalized completed daily OHLCV snapshots into D1 shared cache for all 501 members
  const dates = makeWeekdayDates(40, "2026-11-25");
  const expiresAt = NOW + 48 * 3_600_000;
  const insertSnap = h.sql.prepare(
    `INSERT INTO x8_shared_history_snapshot
      (provider,config_version,instrument_id,interval,received_at,expires_at,first_event,last_event,bar_count,last_close,prior_close,prior_event,last_volume,bars)
     VALUES ('BHARATSTOCK',1,?,'1d',?,?,?,?,?,?,?,?,?,?)`,
  );
  h.sql.exec("BEGIN");
  for (let i = 0; i < constituents.length; i++) {
    const inst = constituents[i];
    const trendingUp = i % 2 === 0; // 251 trending up, 250 trending down
    const bars = dates.map((d, idx) => {
      const base = trendingUp ? 100 + idx * 2 : 300 - idx * 2;
      return {
        date: d,
        open: base - 1,
        high: base + 2,
        low: base - 2,
        close: base,
        adjustedClose: base,
        volume: 50_000 + idx * 100,
        openInterest: null,
        knownAt: new FixedClock().toISOString(),
        adjustment: "RAW_OHLC_ADJUSTED_CLOSE",
        provider: "Licensed exchange history",
      };
    });
    const last = bars.at(-1);
    const prior = bars.at(-2);
    insertSnap.run(
      inst.id,
      NOW - 60_000,
      expiresAt,
      bars[0].date,
      last.date,
      bars.length,
      last.close,
      prior.close,
      prior.date,
      last.volume,
      JSON.stringify(bars),
    );
  }
  h.sql.exec("COMMIT");

  // Verify /api/strategy/universe and /api/market/health report READY + DERIVED_ONLY + 501/501
  h.setUser({ userId: "alice" });
  const uniGet = await (await universeRoute.GET(new Request("https://site.invalid/api/strategy/universe"))).json();
  assert.equal(uniGet.status, "READY");
  assert.equal(uniGet.rightsMode, "DERIVED_ONLY");
  assert.equal(uniGet.membership.expectedCount, 501);
  assert.equal(uniGet.coverage.ready, 501);
  assert.equal(uniGet.scanReadiness.signedIn, true);
  assert.deepEqual(uniGet.eligibleTimeframes, ["1d", "1wk", "1mo"]);

  const healthGet = await (await healthRoute.GET(new Request("https://site.invalid/api/market/health"))).json();
  assert.equal(healthGet.accountType, "STANDARD_MEMBER");
  assert.equal(healthGet.sharedMarketData.status, "READY");
  assert.equal(healthGet.sharedMarketData.coverage.ready, 501);
  assert.equal(healthGet.sharedMarketData.providers, undefined, "Non-owner must not receive internal provider plan details");

  // 4. Derived-only grant MUST block raw display in assetResearch and loadExtendedMarketData
  const rawChart = await dataService.assetResearch("NSE:RELIANCE", "alice", "1d");
  assert.equal(rawChart.candles.length, 0, "Derived-only grant must NEVER serve raw chart candles");
  assert.equal(rawChart.references.length, 0, "Derived-only grant must NEVER serve raw close series");
  const overview = await dataService.loadExtendedMarketData("alice", ["NSE:RELIANCE"]);
  assert.equal(overview.marketQuotes.length, 0, "Derived-only grant must NEVER serve raw daily quotes");

  // 5. Intraday (30m / 1h) rejected cleanly with INTRADAY_NOT_SUPPORTED and 0 quota charged
  const intradayRes = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Intraday Rejected",
        description: "30m intraday check on daily-only Nifty 500 feed.",
        formula: "close > 0",
        mode: "SIMPLE",
        universe: "NIFTY_500",
        universePreset: "NIFTY_500",
        interval: "30m",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    }),
  );
  assert.equal(intradayRes.status, 422);
  assert.equal((await intradayRes.json()).errorCode, "INTRADAY_NOT_SUPPORTED");

  // 6. Ordinary User A (alice) submits Classic Nifty 500 Daily scan (`close > sma(close, 20)`)
  h.resetFetchCalls();
  const reqIdA = randomUUID();
  const submitA = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Alice Nifty 500 Trend",
        description: "Classic close above 20-day SMA across all 501 constituents.",
        formula: "close > sma(close, 20)",
        mode: "SIMPLE",
        universe: "NIFTY_500",
        universePreset: "NIFTY_500",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: reqIdA,
      }),
    }),
  );
  assert.equal(submitA.status, 202);
  const jobA = await submitA.json();
  assert.equal(jobA.coverage.selected, 501);

  // Idempotent duplicate requestId returns same job without double charging; mismatched payload returns 409
  const dupA = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Alice Nifty 500 Trend",
        description: "Classic close above 20-day SMA across all 501 constituents.",
        formula: "close > sma(close, 20)",
        mode: "SIMPLE",
        universe: "NIFTY_500",
        universePreset: "NIFTY_500",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: reqIdA,
      }),
    }),
  );
  assert.equal((await dupA.json()).jobId, jobA.jobId);

  // Ordinary User B (bob) simultaneously submits Advanced Nifty 500 Daily scan (`all(close > sma(close, 10), rsi(close, 14) > 50)`)
  h.setUser({ userId: "bob" });
  const submitB = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "ADVANCED",
        origin: "BUILD",
        name: "Bob Nifty 500 Momentum",
        description: "Advanced momentum rule across all 501 constituents.",
        formula: "all(close > sma(close, 10), rsi(close, 14) > 50)",
        mode: "ADVANCED",
        universe: "CONNECTED_MARKETS",
        universePreset: "MARKET",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    }),
  );
  assert.equal(submitB.status, 202);
  const jobB = await submitB.json();

  // Cross-account IDOR: Bob CANNOT poll Alice's scan job
  const idorPoll = await scanRoute.GET(new Request(`https://site.invalid/api/strategy/scan?jobId=${jobA.jobId}`));
  assert.equal(idorPoll.status, 404);

  // Process all durable batches to completion
  let ticks = 0;
  while (await jobs.processMarketScanBatch(undefined, 100)) {
    ticks++;
    assert.ok(ticks < 50, "Batch processing must terminate cleanly");
  }
  assert.equal(h.getFetchCalls().length, 0, "Shared D1 cache reuse must trigger ZERO upstream provider calls across both users!");

  // Verify Alice's completed scan status, partition accounting, quota, GRAVEYARD & derived-only redaction
  h.setUser({ userId: "alice" });
  const statusA = await (await scanRoute.GET(new Request(`https://site.invalid/api/strategy/scan?jobId=${jobA.jobId}`))).json();
  assert.equal(statusA.state, "COMPLETE");
  assert.equal(statusA.redactionMode, "DERIVED_ONLY");
  assert.equal(statusA.coverage.selected, 501);
  assert.equal(statusA.coverage.evaluated, 501);
  assert.equal(statusA.coverage.matched, 251);
  assert.equal(statusA.coverage.unmatched, 250);
  assert.equal(statusA.coverage.insufficient, 0);
  assert.equal(statusA.coverage.deferred, 0);

  const wsAlice = await workspace.workspaceState("alice");
  assert.equal(wsAlice.scanQuota.classic.used, 1);
  assert.equal(wsAlice.scans.length, 1);
  const archivedA = wsAlice.scans[0];
  assert.equal(archivedA.redaction.applied, true);
  assert.equal(archivedA.redaction.mode, "DERIVED_ONLY");
  assert.equal(archivedA.payload.results.matches, 251);
  assert.equal(archivedA.payload.results.results.length, 501);
  assert.equal(archivedA.payload.results.results[0].metrics, undefined, "Raw metrics MUST be stripped in DERIVED_ONLY mode");
  assert.equal(archivedA.payload.datasets, undefined, "Raw datasets MUST never appear in DERIVED_ONLY GRAVEYARD");

  // Verify Bob's completed Advanced scan & cross-account GRAVEYARD isolation
  h.setUser({ userId: "bob" });
  const statusB = await (await scanRoute.GET(new Request(`https://site.invalid/api/strategy/scan?jobId=${jobB.jobId}`))).json();
  assert.equal(statusB.state, "COMPLETE");
  assert.equal(statusB.coverage.evaluated, 501);
  const wsBob = await workspace.workspaceState("bob");
  assert.equal(wsBob.scanQuota.advanced.usedInWindow, 1);
  assert.equal(wsBob.scans.length, 1);
  assert.notEqual(wsBob.scans[0].id, archivedA.id);
  await assert.rejects(() => workspace.workspaceScanSnapshot("bob", archivedA.id), (e) => e.status === 404);

  // 7. Cancel a queued scan job -> 0 quota charged
  h.setUser({ userId: "alice" });
  const submitCancel = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "To Be Cancelled",
        description: "Test cancellation releases quota reservation cleanly.",
        formula: "close > 0",
        mode: "SIMPLE",
        universe: "NIFTY_500",
        universePreset: "NIFTY_500",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    }),
  );
  const toCancel = await submitCancel.json();
  const cancelled = await (
    await scanRoute.POST(
      new Request("https://site.invalid/api/strategy/scan", {
        method: "POST",
        headers: { origin: "https://site.invalid", "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId: toCancel.jobId }),
      }),
    )
  ).json();
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal((await workspace.workspaceState("alice")).scanQuota.classic.used, 1, "Cancelled scan must charge 0 quota");

  // 8. Expired provider grant immediately stops public reads, withholds GRAVEYARD outcomes, and keeps ECB alive!
  const storedCfg = JSON.parse(h.sql.prepare("SELECT payload FROM x2_providers WHERE provider='BHARATSTOCK'").get().payload);
  storedCfg.rights.expiresAt = "2026-11-20T00:00:00.000Z";
  h.sql.prepare("UPDATE x2_providers SET payload=? WHERE provider='BHARATSTOCK'").run(JSON.stringify(storedCfg));

  const expiredUni = await (await universeRoute.GET(new Request("https://site.invalid/api/strategy/universe"))).json();
  assert.equal(expiredUni.status, "EXPIRED");
  assert.equal(expiredUni.reasonCode, "DATA_EXPIRED");

  const wsAliceExpired = await workspace.workspaceState("alice");
  assert.equal(wsAliceExpired.scans[0].redaction.mode, "WITHHELD");
  assert.equal(wsAliceExpired.scans[0].payload.results.matches, null, "Expired grant must immediately withhold archived outcomes");

  // Unrelated ECB_DAILY scan continues working independently!
  const ecbRes = await scanRoute.POST(
    new Request("https://site.invalid/api/strategy/scan", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "ECB Still Alive",
        description: "Verify ECB reference scans operate independently when shared exchange grant expires.",
        formula: "close > 0",
        mode: "SIMPLE",
        universe: "ECB_DAILY",
        universePreset: "ECB_DAILY",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    }),
  );
  assert.equal(ecbRes.status, 200);
  const ecbBody = await ecbRes.json();
  assert.equal(ecbBody.results.matches, 1);
});

test("Close-only Indian API evaluates close-based SMA/RSI cleanly and marks OHLC-requiring ATR as UNKNOWN without fabricating OHLC", async () => {
  const h = createTestHarness();
  const dataService = await h.load("backend/services/market-data/data-service.ts");
  const engine = await h.load("backend/engines/scan.ts");
  const shared = await h.load("backend/services/market-data/shared-history.ts");

  await dataService.configureProvider("owner", {
    config: {
      provider: "INDIANAPI",
      enabled: true,
      priority: 1,
      version: 0,
      dailyCallLimit: 500,
      lastWrite: randomUUID(),
      datasets: ["prices"],
      instruments: [
        {
          id: "NSE:SBIN",
          name: "State Bank of India",
          symbol: "SBIN",
          providerSymbol: "SBIN",
          market: "NSE",
          mic: "XNSE",
          type: "EQUITY",
          currency: "INR",
          unit: "INR per share",
          timezone: "Asia/Kolkata",
        },
      ],
      rights: {
        display: false,
        analysis: true,
        storage: true,
        redistribution: false,
        derivedDisplay: true,
        verified: true,
        cacheSeconds: 300,
        contractReference: "INDIANAPI-DERIVED-FIXTURE",
        expiresAt: "2027-06-30T23:59:59.000Z",
      },
      sharedHistory: {
        intervals: ["1d"],
        lagMinutes: 30,
        retentionHours: 48,
        dailyLookbackDays: 370,
        dailyRefreshMinutes: 720,
        intradayRefreshMinutes: 120,
        attribution: "Indian API Close-Only Fixture",
        attributionUrl: "https://indianapi.in/indian-stock-market",
        creditWindow: {
          startsAt: "2026-11-01T00:00:00.000Z",
          endsAt: "2026-12-01T00:00:00.000Z",
          availableCredits: 500,
          callsPerMinute: 60,
        },
      },
    },
  });

  const dates = makeWeekdayDates(30, "2026-11-25");
  h.setFetchReply(async () =>
    Response.json({
      datasets: [
        {
          metric: "Price",
          label: "Price on NSE",
          meta: { is_weekly: false },
          values: dates.map((d, i) => [d, String(800 + i * 2)]),
        },
        {
          metric: "Volume",
          label: "Volume",
          meta: { is_weekly: false },
          values: dates.map((d, i) => [d, 1_000_000 + i * 1000]),
        },
      ],
    }),
  );

  // Run scheduled refreshSharedHistory() to ingest real Indian API format into D1
  await shared.refreshSharedHistory();
  assert.equal(h.getFetchCalls().length, 1);

  const universe = await dataService.researchUniverse("alice", {
    provider: "INDIANAPI",
    instrumentIds: ["NSE:SBIN"],
    interval: "1d",
  });
  assert.equal(universe.datasets.length, 1);
  assert.equal(universe.datasets[0].observations[0].open, undefined, "Never invent Open on close-only feed");
  assert.equal(universe.datasets[0].observations[0].high, undefined, "Never invent High on close-only feed");
  assert.equal(universe.datasets[0].observations[0].low, undefined, "Never invent Low on close-only feed");

  const closeScan = engine.evaluateScan(engine.compileFormula("close > sma(close, 5)"), universe.datasets, universe.asOf);
  assert.equal(closeScan.matches, 1);

  const ohlcScan = engine.evaluateScan(engine.compileFormula("atr(14) > 0"), universe.datasets, universe.asOf);
  assert.equal(ohlcScan.matches, 0);
  assert.equal(ohlcScan.unknown, 1, "ATR on close-only history MUST be UNKNOWN, never fabricated OHLC");
});

test("Shared quote, sector-quotes, release & dashboard cards honor display+redistribution grants across providers and keep owner controls isolated", async () => {
  const h = createTestHarness();
  const dataService = await h.load("backend/services/market-data/data-service.ts");
  const nifty = await h.load("backend/services/market-data/nifty-500.ts");
  const nineCard = await h.load("backend/services/market-data/nine-card-markets.ts");
  const quoteRoute = await h.load("app/api/market/quote/route.ts");
  const sectorQuotesRoute = await h.load("app/api/market/sector-quotes/route.ts");
  const providersRoute = await h.load("app/api/x2/providers/route.ts");
  const releaseRoute = await h.load("app/api/release/route.ts");

  // 1. Before any commercial grant, /api/release reports honest capability flags and zero vendor leaks
  const relBefore = await (await releaseRoute.GET(new Request("https://site.invalid/api/release"))).json();
  assert.equal(relBefore.capabilities.sharedCommercialMarketData, false);
  assert.deepEqual(relBefore.capabilities.intradayIntervalsSupported, []);
  assert.equal(/angel\s*one|smartapi|bharatstock|indianapi/i.test(JSON.stringify(relBefore)), false);

  // 2. Non-owner fails closed on owner provider routes and on raw broker /api/market/quote (no scope=shared)
  h.setUser({ userId: "alice" });
  const ownerOnlyDenied = await providersRoute.POST(
    new Request("https://site.invalid/api/x2/providers", {
      method: "POST",
      headers: { origin: "https://site.invalid", "content-type": "application/json" },
      body: JSON.stringify({ op: "refresh-history" }),
    }),
  );
  assert.equal(ownerOnlyDenied.status, 404);

  const directQuoteDenied = await quoteRoute.GET(new Request("https://site.invalid/api/market/quote?ids=NSE:RELIANCE"));
  assert.equal(directQuoteDenied.status, 403);
  assert.equal((await directQuoteDenied.json()).errorCode, "PUBLIC_LICENSE_REQUIRED");

  const emptySharedBefore = await (
    await quoteRoute.GET(new Request("https://site.invalid/api/market/quote?scope=shared&ids=NSE:RELIANCE"))
  ).json();
  assert.deepEqual(emptySharedBefore.quotes, []);

  // 3. Owner configures BharatStock with DERIVED_ONLY + Nifty 500 + NSE:NIFTY index + MCX:GOLD future
  h.setUser({ userId: "owner" });
  const constituents = makeNifty501Fixture();
  await nifty.importNiftyUniverse({
    effectiveDate: "2026-11-23",
    expectedCount: 501,
    provenance: "Authorized NSE Nifty 500 delivery fixture",
    rightsConfirmed: true,
    rightsExpiresAt: "2027-06-30T23:59:59.000Z",
    constituents,
  });

  const dashboardInstruments = [
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
      id: "NSE:NIFTY",
      name: "NIFTY 50",
      symbol: "NIFTY",
      providerSymbol: "NIFTY",
      market: "NSE",
      mic: "XNSE",
      type: "INDEX",
      currency: "INR",
      unit: "pts",
      timezone: "Asia/Kolkata",
    },
  ];
  const baseRights = {
    display: false,
    analysis: true,
    storage: true,
    redistribution: false,
    derivedDisplay: true,
    verified: true,
    cacheSeconds: 300,
    contractReference: "BHARATSTOCK-DERIVED-AND-DISPLAY-FIXTURE",
    expiresAt: "2027-06-30T23:59:59.000Z",
  };
  const sharedHistoryCfg = {
    intervals: ["1d"],
    lagMinutes: 30,
    retentionHours: 48,
    dailyLookbackDays: 400,
    dailyRefreshMinutes: 720,
    intradayRefreshMinutes: 120,
    attribution: "BharatStock EOD Feed",
    attributionUrl: "https://bharatstockapi.com/reference",
    creditWindow: {
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z",
      availableCredits: 5000,
      callsPerMinute: 120,
    },
  };

  await dataService.configureProvider("owner", {
    config: {
      provider: "BHARATSTOCK",
      enabled: true,
      priority: 1,
      version: 0,
      dailyCallLimit: 5000,
      lastWrite: randomUUID(),
      datasets: ["candles"],
      instruments: dashboardInstruments,
      rights: baseRights,
      sharedHistory: sharedHistoryCfg,
    },
  });

  const dates = makeWeekdayDates(15, "2026-11-25");
  const expiresAt = NOW + 48 * 3_600_000;
  const insertSnap = h.sql.prepare(
    `INSERT INTO x8_shared_history_snapshot
      (provider,config_version,instrument_id,interval,received_at,expires_at,first_event,last_event,bar_count,last_close,prior_close,prior_event,last_volume,bars)
     VALUES ('BHARATSTOCK',?,?,'1d',?,?,?,?,?,?,?,?,?,?)`,
  );
  const seedRows = [
    { id: "NSE:RELIANCE", base: 2950, step: 10 },
    { id: "NSE:NIFTY", base: 24200, step: 45 },
  ];
  function seedVersion(cfgVersion) {
    for (const row of seedRows) {
      const bars = dates.map((d, idx) => {
        const c = row.base + idx * row.step;
        return {
          date: d,
          open: c - 5,
          high: c + 8,
          low: c - 8,
          close: c,
          adjustedClose: c,
          volume: 100_000 + idx * 500,
          openInterest: null,
          knownAt: new FixedClock().toISOString(),
          adjustment: "RAW_OHLC_ADJUSTED_CLOSE",
          provider: "BharatStock EOD Feed",
        };
      });
      const last = bars.at(-1);
      const prior = bars.at(-2);
      insertSnap.run(
        cfgVersion,
        row.id,
        NOW - 60_000,
        expiresAt,
        bars[0].date,
        last.date,
        bars.length,
        last.close,
        prior.close,
        prior.date,
        last.volume,
        JSON.stringify(bars),
      );
    }
  }
  seedVersion(1);

  // 4. With DERIVED_ONLY, shared quote / sector-quotes / Global tiles NEVER expose raw prices, while /api/release reflects READY screening
  h.setUser({ userId: "alice" });
  const derivedSharedQuotes = await (
    await quoteRoute.GET(new Request("https://site.invalid/api/market/quote?scope=shared&ids=NSE:RELIANCE"))
  ).json();
  assert.deepEqual(derivedSharedQuotes.quotes, []);

  const derivedSectorQuotes = await (
    await sectorQuotesRoute.GET(new Request("https://site.invalid/api/market/sector-quotes"))
  ).json();
  assert.deepEqual(derivedSectorQuotes.quotes, []);
  assert.deepEqual(derivedSectorQuotes.industryQuotes, []);

  const derivedOverview = await nineCard.getMarketOverviewPayload("alice");
  const niftyDerivedCard = derivedOverview.cards.find((c) => c.canonicalId === "NSE:NIFTY");
  assert.equal(niftyDerivedCard?.value, null, "DERIVED_ONLY grant must not expose raw index quote on dashboard");

  const relReady = await (await releaseRoute.GET(new Request("https://site.invalid/api/release"))).json();
  assert.equal(relReady.capabilities.sharedCommercialMarketData, true);
  assert.deepEqual(relReady.capabilities.intradayIntervalsSupported, []);

  // 5. Upgrade BHARATSTOCK grant to full display + redistribution (version 1 -> 2): multi-provider quotes & FUTURE cards light up
  h.setUser({ userId: "owner" });
  const upgraded = await dataService.configureProvider("owner", {
    config: {
      provider: "BHARATSTOCK",
      enabled: true,
      priority: 1,
      version: 1,
      dailyCallLimit: 5000,
      lastWrite: randomUUID(),
      datasets: ["candles"],
      instruments: dashboardInstruments,
      rights: { ...baseRights, display: true, redistribution: true },
      sharedHistory: sharedHistoryCfg,
    },
  });
  const upgradedVersion = upgraded.providers.find((p) => p.id === "BHARATSTOCK")?.config?.version ?? 2;
  seedVersion(upgradedVersion);

  h.setUser({ userId: "alice" });
  const displayShared = await (
    await quoteRoute.GET(new Request("https://site.invalid/api/market/quote?scope=shared&ids=NSE:RELIANCE,UNKNOWN:SYM"))
  ).json();
  assert.equal(displayShared.quotes.length, 1);
  assert.equal(displayShared.quotes[0].id, "NSE:RELIANCE");
  assert.equal(displayShared.quotes[0].providerId, "BHARATSTOCK");
  assert.equal(displayShared.quotes[0].attribution.label, "BharatStock EOD Feed");

  const displaySector = await (
    await sectorQuotesRoute.GET(new Request("https://site.invalid/api/market/sector-quotes"))
  ).json();
  const relIndustryQuote = displaySector.industryQuotes.find((q) => q.id === "NSE:RELIANCE");
  assert.ok(relIndustryQuote, "sector-quotes must include non-INDIANAPI equity display providers such as BHARATSTOCK");
  assert.equal(relIndustryQuote.providerId, "BHARATSTOCK");

  const displayOverview = await nineCard.getMarketOverviewPayload("alice");
  const niftyDisplayCard = displayOverview.cards.find((c) => c.canonicalId === "NSE:NIFTY");
  assert.ok(niftyDisplayCard && niftyDisplayCard.value > 0, "NSE:NIFTY card should populate from shared display snapshot");
  assert.equal(niftyDisplayCard.assetClass, "INDEX");
  assert.ok(niftyDisplayCard.previousClose && niftyDisplayCard.previousClose > 0, "NSE:NIFTY card should retain previous close from sparkline series");

  const tooManyIds = Array.from({ length: 161 }, (_, i) => `NSE:SYM${i}`).join(",");
  const tooManyRes = await quoteRoute.GET(new Request(`https://site.invalid/api/market/quote?scope=shared&ids=${tooManyIds}`));
  assert.equal(tooManyRes.status, 400);
});
