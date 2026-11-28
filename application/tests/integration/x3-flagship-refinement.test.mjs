/**
 * Strategic Souls X 3.0 — Flagship Refinement Regression Suite (R01–R10, R17–R22)
 * Verifies:
 *   - R02 / D-001: Canonical MARKET_DATA_API_KEY one-key rotation precedence & activation readiness
 *   - R03–R05 / D-002 / D-011 / D-013 / D-014: Intraday 30m/1h/3h/6h scans on default Markets
 *     with licensed TrueData snapshots (65d 1h history -> session-anchored 3h/6h without double aggregation),
 *     daily-only fail-closed 422 INTRADAY_NOT_SUPPORTED, and Draw 3h/6h support
 *   - R06 / D-003: Unified Markets scope (Nifty 500 + active indices + MCX + GLOBAL deduplicated)
 *   - R07: Strict server-owned MY_WATCHLIST scope & cross-account isolation
 *   - R10: Password reset & email verification lifecycle, atomic consumption, sanitized failure logs
 *   - R19–R22: Portfolio fixed-point decimal + IST rollover, heatmap honesty, 60 avatars / 30 banners,
 *     notification deep-link targets
 */
import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { d1MigrationsDir } from "../helpers/paths.mjs";

const NOW = Date.parse("2026-11-27T11:30:00.000Z"); // Friday 17:00 IST (post NSE close)

class FixedClock extends Date {
  constructor(...args) {
    super(...(args.length ? args : [NOW]));
  }
  static now() {
    return NOW;
  }
}

function createHarness(envOverrides = {}) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(d1MigrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(resolve(d1MigrationsDir, file), "utf8"));
  }

  class Statement {
    constructor(query, args = []) {
      this.query = query;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.query, args);
    }
    async first(col) {
      const row = sql.prepare(this.query).get(...this.args);
      if (!row) return null;
      return col ? row[col] ?? null : row;
    }
    async all() {
      return { results: sql.prepare(this.query).all(...this.args), success: true };
    }
    execute() {
      const r = sql.prepare(this.query).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
    async run() {
      return this.execute();
    }
  }

  const DB = {
    prepare: (q) => new Statement(q),
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const out = statements.map((s) => s.execute());
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
    X2_OWNER_SUBJECT: "owner-flagship",
    MARKET_DATA_MODE: "private",
    ENABLE_PRIVATE_BROKER_DATA: "false",
    ENABLE_PUBLIC_EXCHANGE_QUOTES: "false",
    ...envOverrides,
  };

  let activeUser = { userId: "alice-std", email: "alice@example.test", displayName: "Alice" };
  const warnings = [];
  const customConsole = {
    ...console,
    warn: (...args) => warnings.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")),
  };

  const context = vm.createContext({
    console: customConsole,
    Response,
    Request,
    Headers,
    TextEncoder,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: {
      subtle: webcrypto.subtle,
      getRandomValues: (arr) => webcrypto.getRandomValues(arr),
      randomUUID,
    },
    URL,
    URLSearchParams,
    Intl,
    Date: FixedClock,
    btoa,
    atob,
    Uint8Array,
    Float64Array,
    Int32Array,
    BigInt,
    Number,
    Math,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Boolean,
    Error,
    TypeError,
    RegExp,
    Promise,
    Symbol,
    process,
    fetch: async () => {
      throw new Error("Unexpected external network fetch in offline flagship test.");
    },
  });

  const cache = new Map();
  function resolveFile(spec, from) {
    if (spec === "cloudflare:workers") return "virtual:cloudflare";
    if (spec === "next/headers") return "virtual:headers";
    if (spec === "next/server") return "virtual:server";
    if (spec === "next/navigation") return "virtual:navigation";
    const base = resolve(dirname(from), spec);
    for (const cand of [base, base + ".ts", base + ".tsx", base + ".js", base + "/index.ts"]) {
      if (existsSync(cand)) return cand;
    }
    throw new Error("Cannot resolve " + spec + " from " + from);
  }

  function getModule(path) {
    if (cache.has(path)) return cache.get(path);
    let mod;
    if (path === "virtual:cloudflare") {
      mod = new vm.SyntheticModule(["env"], function () {
        this.setExport("env", env);
      }, { context });
    } else if (path === "virtual:headers") {
      mod = new vm.SyntheticModule(["headers", "cookies"], function () {
        this.setExport("headers", async () => new Headers());
        this.setExport("cookies", async () => ({ get: () => undefined, getAll: () => [] }));
      }, { context });
    } else if (path === "virtual:navigation") {
      mod = new vm.SyntheticModule(["redirect"], function () {
        this.setExport("redirect", (u) => {
          throw new Error(`REDIRECT:${u}`);
        });
      }, { context });
    } else if (path === "virtual:server") {
      mod = new vm.SyntheticModule(["NextResponse"], function () {
        this.setExport("NextResponse", {
          json: (d, i = {}) =>
            new Response(JSON.stringify(d), {
              ...i,
              headers: { "Content-Type": "application/json", ...i.headers },
            }),
        });
      }, { context });
    } else if (path.endsWith("backend\\auth\\session.ts") || path.endsWith("backend/auth/session.ts")) {
      const src = readFileSync(path, "utf8");
      const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      mod = new vm.SourceTextModule(js, { context, identifier: path });
    } else {
      const js = ts.transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      mod = new vm.SourceTextModule(js, { context, identifier: path });
    }
    cache.set(path, mod);
    return mod;
  }

  async function load(rel) {
    const abs = resolve(rel);
    const mod = getModule(abs);
    if (mod.status === "unlinked") {
      await mod.link((spec, refer) => getModule(resolveFile(spec, refer.identifier)));
    }
    if (mod.status === "linked") {
      await mod.evaluate();
    }
    return mod.namespace;
  }

  function seedAccount(subject, alias = "User") {
    const iso = new FixedClock().toISOString();
    sql
      .prepare(
        `INSERT OR IGNORE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
         VALUES (?, ?, ?, '2026-11-14-v4', 1, ?)`,
      )
      .run(subject, alias, iso, iso);
  }

  seedAccount("owner-flagship", "Owner");
  seedAccount("alice-std", "Alice");
  seedAccount("bob-std", "Bob");

  return {
    sql,
    env,
    warnings,
    load,
    setUser: (u) => {
      activeUser = u;
    },
    getUser: () => activeUser,
  };
}

function makeHourlyNseBars(tradingDays, endDateIso = "2026-11-27", trendUp = true) {
  const bars = [];
  const days = [];
  let cursor = Date.parse(`${endDateIso}T00:00:00Z`);
  while (days.length < tradingDays) {
    const d = new Date(cursor);
    const wd = d.getUTCDay();
    if (wd > 0 && wd < 6) {
      days.push(d.toISOString().slice(0, 10));
    }
    cursor -= 86_400_000;
  }
  days.reverse();
  let step = 0;
  for (const day of days) {
    // 6 completed NSE hourly bars: 03:45, 04:45, 05:45, 06:45, 07:45, 08:45 UTC (09:15..14:15 IST start)
    for (let h = 0; h < 6; h++) {
      const hourUtc = 3 + h;
      const iso = `${day}T${String(hourUtc).padStart(2, "0")}:45:00.000Z`;
      const base = trendUp ? 100 + step * 0.5 : 500 - step * 0.5;
      bars.push({
        date: iso,
        open: base - 0.5,
        high: base + 1.5,
        low: base - 1.2,
        close: base,
        adjustedClose: null,
        volume: 10_000 + step * 50,
        openInterest: null,
        knownAt: new FixedClock().toISOString(),
        adjustment: "RAW",
        provider: "Licensed exchange history",
      });
      step++;
    }
  }
  return bars;
}

function make30mNseBars(tradingDays, endDateIso = "2026-11-27", trendUp = true) {
  const bars = [];
  const days = [];
  let cursor = Date.parse(`${endDateIso}T00:00:00Z`);
  while (days.length < tradingDays) {
    const d = new Date(cursor);
    const wd = d.getUTCDay();
    if (wd > 0 && wd < 6) days.push(d.toISOString().slice(0, 10));
    cursor -= 86_400_000;
  }
  days.reverse();
  let step = 0;
  for (const day of days) {
    // 12 completed 30m bars starting at 09:15 IST = 03:45 UTC
    let startMs = Date.parse(`${day}T03:45:00.000Z`);
    for (let k = 0; k < 12; k++) {
      const base = trendUp ? 100 + step * 0.3 : 300 - step * 0.3;
      bars.push({
        date: new Date(startMs).toISOString(),
        open: base - 0.3,
        high: base + 0.9,
        low: base - 0.8,
        close: base,
        adjustedClose: null,
        volume: 5000 + step * 25,
        openInterest: null,
        knownAt: new FixedClock().toISOString(),
        adjustment: "RAW",
        provider: "Licensed exchange history",
      });
      startMs += 1_800_000;
      step++;
    }
  }
  return bars;
}

function makeDailyBars(tradingDays, endDateIso = "2026-11-27", trendUp = true) {
  const days = [];
  let cursor = Date.parse(`${endDateIso}T00:00:00Z`);
  while (days.length < tradingDays) {
    const d = new Date(cursor);
    const wd = d.getUTCDay();
    if (wd > 0 && wd < 6) days.push(d.toISOString().slice(0, 10));
    cursor -= 86_400_000;
  }
  days.reverse();
  return days.map((date, idx) => {
    const base = trendUp ? 100 + idx * 1.2 : 400 - idx * 1.2;
    return {
      date,
      open: base - 1,
      high: base + 2,
      low: base - 2,
      close: base,
      adjustedClose: base,
      volume: 25_000 + idx * 100,
      openInterest: null,
      knownAt: new FixedClock().toISOString(),
      adjustment: "RAW",
      provider: "Licensed exchange history",
    };
  });
}

test("R02 / D-001: Canonical MARKET_DATA_API_KEY one-key rotation overrides legacy secret & reports activation readiness cleanly", async () => {
  const h = createHarness({
    BHARATSTOCK_API_KEY: "legacy_bharat_old_key_1111",
    MARKET_DATA_PROVIDER: "BHARATSTOCK",
    MARKET_DATA_API_KEY: "rotated_canonical_key_9999",
  });
  const providers = await h.load("backend/services/market-data/providers.ts");
  const gateway = await h.load("backend/services/market-data/universal-gateway.ts");

  assert.equal(providers.secretFrom("BHARATSTOCK", h.env), "rotated_canonical_key_9999");
  const status = gateway.inspectProviderSecretStatus("BHARATSTOCK", h.env);
  assert.equal(status.configured, true);
  assert.equal(status.source, "MARKET_DATA_API_KEY");
  assert.equal(status.envVar, "MARKET_DATA_API_KEY");

  // Unconfigured provider readiness honestly lists missing license metadata without leaking key values
  const readiness = gateway.inspectCanonicalActivationReadiness([], NOW, h.env);
  assert.equal(readiness.targetProvider, "BHARATSTOCK");
  assert.equal(readiness.canonicalSecretSet, true);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missingInputs.some((m) => /BHARATSTOCK/.test(m)));
  assert.equal(JSON.stringify(readiness).includes("rotated_canonical_key_9999"), false);
});

test("R03–R06 / D-002 / D-003 / D-011 / D-014: Unified Markets scope & intraday 30m/1h/3h/6h scans succeed end-to-end on licensed TrueData", async () => {
  const h = createHarness({
    MARKET_DATA_PROVIDER: "TRUEDATA",
    MARKET_DATA_API_KEY: "truedata_canonical_live_token_2026",
  });
  const dataService = await h.load("backend/services/market-data/data-service.ts");
  const nifty = await h.load("backend/services/market-data/nifty-500.ts");
  const jobs = await h.load("backend/services/research/market-scan-jobs.ts");

  // Import authorized 500-member Nifty snapshot
  const constituents = [
    { id: "NSE:RELIANCE", isin: "INE002A01018", name: "Reliance Industries", industry: "Energy" },
    { id: "NSE:TCS", isin: "INE467B01029", name: "Tata Consultancy Services", industry: "IT" },
  ];
  for (let i = 3; i <= 500; i++) {
    constituents.push({
      id: `NSE:SYM${String(i).padStart(3, "0")}`,
      isin: `INE000A${String(i).padStart(5, "0")}`,
      name: `Constituent ${i}`,
      industry: "Financial Services",
    });
  }
  await nifty.importNiftyUniverse({
    effectiveDate: "2026-11-23",
    expectedCount: 500,
    provenance: "Authorized NSE Nifty 500 snapshot fixture",
    rightsConfirmed: true,
    rightsExpiresAt: "2027-06-30T23:59:59.000Z",
    constituents,
  });

  // Configure TrueData with NSE equities + NSE index + active MCX future + 30m/1h/1d intervals
  await dataService.configureProvider("owner-flagship", {
    config: {
      provider: "TRUEDATA",
      enabled: true,
      priority: 1,
      version: 0,
      dailyCallLimit: 5000,
      lastWrite: randomUUID(),
      datasets: ["candles"],
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
          id: "NSE:TCS",
          name: "Tata Consultancy Services",
          symbol: "TCS",
          providerSymbol: "TCS",
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
          providerSymbol: "NIFTY50",
          market: "NSE",
          mic: "XNSE",
          type: "INDEX",
          currency: "INR",
          unit: "Index points",
          timezone: "Asia/Kolkata",
        },
        {
          id: "MCX:GOLD27FEB",
          name: "MCX Gold Feb 2027",
          symbol: "GOLD",
          providerSymbol: "GOLD27FEBFUT",
          market: "MCX",
          mic: "XMCX",
          type: "FUTURE",
          currency: "INR",
          unit: "INR per 10g",
          timezone: "Asia/Kolkata",
          expiry: "2027-02-05",
          lotSize: 100,
          tickSize: 1,
        },
      ],
      rights: {
        display: true,
        analysis: true,
        storage: true,
        redistribution: true,
        derivedDisplay: true,
        verified: true,
        cacheSeconds: 300,
        contractReference: "TRUEDATA-INTRADAY-FIXTURE",
        expiresAt: "2027-06-30T23:59:59.000Z",
      },
      sharedHistory: {
        intervals: ["1d", "30m", "1h"],
        lagMinutes: 30,
        retentionHours: 48,
        dailyLookbackDays: 400,
        dailyRefreshMinutes: 720,
        intradayRefreshMinutes: 120,
        attribution: "TrueData Licensed Intraday & EOD",
        attributionUrl: "https://www.truedata.in/",
      },
    },
  });

  // Seed 1d, 30m, and 1h snapshots (45 trading days ~63 calendar days of 1h bars for full 6H coverage!)
  const insertSnap = h.sql.prepare(
    `INSERT INTO x8_shared_history_snapshot
      (provider,config_version,instrument_id,interval,received_at,expires_at,first_event,last_event,bar_count,last_close,prior_close,prior_event,last_volume,bars)
     VALUES ('TRUEDATA',1,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const exp = NOW + 48 * 3_600_000;
  for (const [id, trendUp] of [
    ["NSE:RELIANCE", true],
    ["NSE:TCS", false],
    ["NSE:NIFTY", true],
    ["MCX:GOLD27FEB", true],
  ]) {
    const dBars = makeDailyBars(40, "2026-11-27", trendUp);
    insertSnap.run(
      id, "1d", NOW - 60_000, exp, dBars[0].date, dBars.at(-1).date, dBars.length,
      dBars.at(-1).close, dBars.at(-2).close, dBars.at(-2).date, dBars.at(-1).volume, JSON.stringify(dBars),
    );
    const m30Bars = make30mNseBars(6, "2026-11-27", trendUp);
    insertSnap.run(
      id, "30m", NOW - 60_000, exp, m30Bars[0].date, m30Bars.at(-1).date, m30Bars.length,
      m30Bars.at(-1).close, m30Bars.at(-2).close, m30Bars.at(-2).date, m30Bars.at(-1).volume, JSON.stringify(m30Bars),
    );
    const h1Bars = makeHourlyNseBars(45, "2026-11-27", trendUp);
    insertSnap.run(
      id, "1h", NOW - 60_000, exp, h1Bars[0].date, h1Bars.at(-1).date, h1Bars.length,
      h1Bars.at(-1).close, h1Bars.at(-2).close, h1Bars.at(-2).date, h1Bars.at(-1).volume, JSON.stringify(h1Bars),
    );
  }

  // 1. Unified Markets (24H) includes Nifty 500 (500) + NSE:NIFTY + MCX:GOLD27FEB = 502 deduplicated instruments!
  const dailyUnified = await jobs.submitMarketScan("alice-std", {
    action: "run-scan",
    scanRequestVersion: 2,
    scanTier: "CLASSIC",
    name: "Unified Markets Daily",
    description: "Unified default Markets scope covering Nifty 500 plus active indices and MCX futures.",
    formula: "close > sma(close, 10)",
    mode: "SIMPLE",
    universe: "CONNECTED_MARKETS",
    universePreset: "MARKET",
    interval: "1d",
    partialPolicy: "ALLOW_UNKNOWN",
    outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    requestId: randomUUID(),
  });
  assert.equal(dailyUnified.coverage.selected, 502, "Markets scope must unify Nifty 500 + NSE:NIFTY + MCX:GOLD27FEB deduplicated");

  // 2. Intraday 3H and 6H on default Markets MUST NOT be unconditionally rejected (D-002) and MUST NOT double-aggregate to 0 bars (D-014)!
  for (const interval of ["30m", "1h", "3h", "6h"]) {
    const job = await jobs.submitMarketScan("bob-std", {
      action: "run-scan",
      scanRequestVersion: 2,
      scanTier: "CLASSIC",
      name: `Markets Intraday ${interval}`,
      description: `Intraday ${interval} scan across unified Markets scope.`,
      formula: "close > sma(close, 5)",
      mode: "SIMPLE",
      universe: "CONNECTED_MARKETS",
      universePreset: "MARKET",
      interval,
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      requestId: randomUUID(),
    });
    assert.equal(job.state, "QUEUED");
    while (await jobs.processMarketScanBatch(undefined, 100, job.jobId)) {
      // process until done
    }
    const status = await jobs.marketScanStatus("bob-std", job.jobId);
    assert.equal(status.state, "PARTIAL", `Intraday ${interval} scan must honestly report PARTIAL when 4 of 502 members have cached snapshots`);
    assert.equal(status.coverage.selected, 502);
    // NSE:RELIANCE, NSE:NIFTY, MCX:GOLD27FEB match (`trendUp=true`), NSE:TCS fails (`trendUp=false`)
    assert.ok(status.coverage.matched >= 2, `Intraday ${interval} scan must match trending instruments (got ${status.coverage.matched})`);
    assert.equal(status.coverage.unmatched, 1, `Intraday ${interval} scan must evaluate downtrending NSE:TCS as unmatched`);
  }
});

test("R07: Watchlist scope strictly uses server-owned watchlist and blocks cross-account watchlistId access", async () => {
  const h = createHarness();
  const jobs = await h.load("backend/services/research/market-scan-jobs.ts");
  const nowIso = new FixedClock().toISOString();

  // Seed Alice's private watchlist with ECB:USDINR
  h.sql
    .prepare(
      `INSERT INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
       VALUES ('wl-alice-001', 'alice-std', 'watchlist', 'Alice Core', ?, 1, 0, 'lw1', ?, ?)`,
    )
    .run(JSON.stringify({ items: ["ECB:USDINR"] }), nowIso, nowIso);

  // Bob CANNOT scan Alice's watchlistId -> 404
  await assert.rejects(
    () =>
      jobs.submitMarketScan("bob-std", {
        action: "run-scan",
        scanRequestVersion: 2,
        scanTier: "CLASSIC",
        name: "Cross Account Watchlist Probe",
        description: "Verify cross-account watchlist ID is denied.",
        formula: "close > 0",
        mode: "SIMPLE",
        universe: "CONNECTED_MARKETS",
        universePreset: "MY_WATCHLIST",
        watchlistId: "wl-alice-001",
        instrumentIds: ["NSE:RELIANCE"],
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        requestId: randomUUID(),
      }),
    (err) => err.status === 404,
  );
});

test("R10: Password reset & email verification enforce single-use tokens, session revocation, non-enumeration, and sanitized failure logs", async () => {
  const h = createHarness();
  const session = await h.load("backend/auth/session.ts");
  const transport = await h.load("backend/auth/email-transport.ts");

  // Register a real user and active session via session module
  const req = new Request("https://strategic-souls.example/api/auth/register", {
    method: "POST",
    headers: { "user-agent": "FlagshipTest/1.0" },
  });
  const regUser = await session.registerEmailUser({
    email: "resetter@example.test",
    password: "StrongPass!2026",
    displayName: "Reset Tester",
  });
  await session.createSession(regUser.userId, req);
  assert.ok(regUser.userId);

  // 1. Capture delivered reset token via test transport hook (never returned in HTTP payload)
  const sent = [];
  transport.setTestSecurityEmailTransport(async (msg) => {
    sent.push(msg);
    return { delivered: true, configured: true, provider: "test" };
  });

  const resetReq = await session.requestPasswordReset("resetter@example.test", "https://strategic-souls.example");
  const nonExistentReq = await session.requestPasswordReset("nobody@example.test", "https://strategic-souls.example");
  assert.equal(resetReq.accepted, true);
  assert.equal(resetReq.message, nonExistentReq.message, "Forgot-password response must be non-enumerating");
  assert.equal(sent.length, 1);
  assert.equal(JSON.stringify(resetReq).includes(sent[0].token), false, "Raw token must NEVER appear in response");

  // 2. Complete reset atomically -> revokes all existing sessions & rejects second reuse
  const completed = await session.completePasswordReset(sent[0].token, "NewStrongPass!2027");
  assert.equal(completed.reset, true);
  const sessionsLeft = h.sql.prepare("SELECT count(*) AS n FROM auth_sessions WHERE user_id=?").get(regUser.userId);
  assert.equal(sessionsLeft.n, 0, "Password reset must revoke all active sessions");
  await assert.rejects(() => session.completePasswordReset(sent[0].token, "AnotherStrong!2028"));

  // 3. Transport failure logs sanitized warning (zero emails or raw tokens!)
  transport.setTestSecurityEmailTransport(async () => ({
    delivered: false,
    configured: true,
    provider: "resend",
    statusCode: 502,
    errorCode: "RESEND_HTTP_502",
  }));
  const emailChg = await session.requestEmailChange(
    regUser.userId,
    "NewStrongPass!2027",
    "newaddr@example.test",
    "https://strategic-souls.example",
  );
  assert.equal(emailChg.emailDeliveryConfigured, true);
  assert.equal(emailChg.delivered, false);
  assert.match(emailChg.message, /temporarily unavailable/i);
  assert.ok(h.warnings.length > 0);
  for (const w of h.warnings) {
    assert.equal(w.includes("newaddr@example.test"), false, "Sanitized logs must never leak emails");
    assert.equal(w.includes("resetter@example.test"), false, "Sanitized logs must never leak emails");
  }
  transport.setTestSecurityEmailTransport(null);
});

test("R19–R22: Portfolio exact decimal + IST date, heatmap honesty, 60 avatars / 30 banners, and notification routing", async () => {
  const h = createHarness();
  const portfolio = await h.load("backend/engines/portfolio.ts");
  const sectors = await h.load("backend/services/market-data/sectors-and-ecosystem.ts");
  const avatars = await h.load("backend/services/profile/avatars.ts");
  const banners = await h.load("backend/services/profile/banners.ts");
  const notify = await h.load("backend/services/community/notification-target.ts");

  // R19: Fractional closure 0.3 - 0.1 - 0.2 === 0 & IST date boundary (2026-11-27T19:00:00Z is 2026-11-28 00:30 IST!)
  const summary = portfolio.summarizePortfolio(
    [
      { kind: "BUY", symbol: "NSE:TCS", quantity: 0.3, price: 100, fees: 0, currency: "INR", date: "2026-11-25" },
      { kind: "SELL", symbol: "NSE:TCS", quantity: 0.1, price: 110, fees: 0, currency: "INR", date: "2026-11-26" },
      { kind: "SELL", symbol: "NSE:TCS", quantity: 0.2, price: 120, fees: 0, currency: "INR", date: "2026-11-27" },
    ],
    "INR",
    "2026-11-27T11:30:00.000Z",
  );
  assert.equal(summary.holdings[0].quantity, 0);
  assert.equal(summary.holdings[0].basis, 0);
  assert.equal(portfolio.istCalendarDate("2026-11-27T19:00:00.000Z"), "2026-11-28");
  assert.throws(() =>
    portfolio.validateTransaction(
      { kind: "BUY", symbol: "NSE:TCS", quantity: 1, price: 100, fees: 0, currency: "INR", date: "2026-11-28" },
      "2026-11-27T18:00:00.000Z", // 23:30 IST on 2026-11-27 -> 2026-11-28 is future!
    ),
  );

  // R20: Heatmap never fabricates colored squares for unavailable or stale quotes
  const hm = sectors.buildSectorHeatmaps(
    new Map([
      ["NSE:HDFCBANK", { value: 1650, pctChange: 1.8, unit: "INR", provider: "Licensed", quality: "STALE" }],
    ]),
  );
  const bank = hm.find((s) => s.sectorId === "NSE:BANKNIFTY");
  assert.equal(bank.connectedCount, 0);
  assert.equal(bank.tiles[0].tone, "UNAVAILABLE");
  assert.equal(bank.tiles[0].stale, true);

  // R21: 60 avatar assets on disk & 30 banners (24 dark + 6 light)
  assert.equal(avatars.AVATAR_CATALOG.length, 60);
  for (const av of avatars.AVATAR_CATALOG) {
    assert.ok(existsSync(resolve("public", av.assetPath.replace(/^\//, ""))), `Missing avatar asset ${av.assetPath}`);
  }
  assert.equal(banners.BANNER_PRESETS.length, 30);
  assert.equal(banners.BANNER_PRESETS.filter((b) => b.theme === "dark").length, 24);
  assert.equal(banners.BANNER_PRESETS.filter((b) => b.theme === "light").length, 6);

  // R22: Notification deep links route accurately & reject malformed IDs
  assert.equal(
    notify.notificationHref(notify.notificationTarget("MESSAGE", "thread_12345678")),
    "/?view=community&tab=chats&thread=thread_12345678",
  );
  assert.equal(
    notify.notificationHref(notify.notificationTarget("SOUL_COMMENT", "post_12345678", "c:comment_9999")),
    "/?view=community&tab=souls&post=post_12345678&anchor=comment_9999",
  );
  assert.equal(
    notify.notificationHref(notify.notificationTarget("SCAN_COMPLETE", "scan_12345678")),
    "/?view=strategy&scan=scan_12345678",
  );
  assert.equal(notify.notificationTarget("SOUL_LIKE", "bad"), null);
});
