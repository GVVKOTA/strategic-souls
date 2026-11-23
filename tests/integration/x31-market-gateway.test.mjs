/**
 * End-to-end integration tests for the Private Angel One Adapter Server + Cloudflare Worker Gateway Routes.
 * Verifies:
 * - Loopback-only service-token auth (default deny)
 * - Owner-only route isolation (401 unauthenticated, 403 non-owner PUBLIC_LICENSE_REQUIRED, 200 owner)
 * - Independent NSE, BSE, MCX quote & candle routing without leaking secrets
 * - Clean ADAPTER_OFFLINE degradation when owner host sleeps
 * - Explicit DEMO / SYNTHETIC isolation when opted in
 * - Zero leakage into data-service.ts for non-owner users
 */

import "../../operations/scripts/ts-node-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const { startMarketAdapterServer } = await import(
  "../../backend/services/market-data/angelone/adapter-server.ts"
);
const { InstrumentMaster } = await import("../../backend/services/market-data/angelone/instrument-master.ts");
const { normalizeAngelOneCandles } = await import("../../backend/services/market-data/angelone/normalizer.ts");

const FAKE_API_KEY = "FAKE_ANGEL_API_KEY_99";
const FAKE_CLIENT_ID = "FAKECLT999";
const FAKE_MPIN = "9876";
const FAKE_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const FAKE_SERVICE_TOKEN = "local-adapter-service-token-32-chars-minimum-xyz";

function createMockAngelOneFetcher() {
  return async (url, init) => {
    const u = String(url);
    if (u.includes("loginByPassword")) {
      return Response.json({
        status: true,
        message: "SUCCESS",
        data: {
          jwtToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.mockjwt12345678901234567890",
          refreshToken: "MOCK_REFRESH_TOKEN_SECRET",
          feedToken: "MOCK_FEED_TOKEN_SECRET",
        },
      });
    }
    if (u.includes("getProfile")) {
      return Response.json({
        status: true,
        data: {
          clientcode: FAKE_CLIENT_ID,
          name: "PRIVATE ACCOUNT HOLDER",
          exchanges: ["nse_cm", "bse_cm", "mcx_fo"],
        },
      });
    }
    if (u.includes("/market/v1/quote/")) {
      const req = JSON.parse(String(init?.body ?? "{}"));
      const exchTokens = req.exchangeTokens ?? {};
      const fetched = [];
      for (const [exch, tokens] of Object.entries(exchTokens)) {
        for (const tok of tokens) {
          if (exch === "NSE" && tok === "3045") {
            fetched.push({
              exchange: "NSE",
              tradingSymbol: "SBIN-EQ",
              symbolToken: "3045",
              ltp: 1165.1,
              open: 1150,
              high: 1174.9,
              low: 1144,
              close: 1156,
              tradeVolume: 17524838,
              opnInterest: 999999,
              exchTradeTime: "20-Nov-2026 15:59:46",
              exchFeedTime: "21-Nov-2026 06:55:06",
            });
          } else if (exch === "BSE" && tok === "500112") {
            fetched.push({
              exchange: "BSE",
              tradingSymbol: "SBIN",
              symbolToken: "500112",
              ltp: 1164.95,
              open: 1152,
              high: 1174.75,
              low: 1143.6,
              close: 1158,
              tradeVolume: 949798,
              opnInterest: 0,
              exchTradeTime: "20-Nov-2026 15:59:30",
              exchFeedTime: "21-Nov-2026 06:55:09",
            });
          } else if (exch === "MCX" && tok === "495213") {
            fetched.push({
              exchange: "MCX",
              tradingSymbol: "GOLD04DEC26FUT",
              symbolToken: "495213",
              ltp: 121778,
              open: 123629,
              high: 123975,
              low: 121424,
              close: 121778,
              tradeVolume: 15370,
              opnInterest: 11430,
              exchTradeTime: "20-Nov-2026 23:54:47",
              exchFeedTime: "21-Nov-2026 06:57:06",
            });
          }
        }
      }
      return Response.json({ status: true, message: "SUCCESS", data: { fetched, unfetched: [] } });
    }
    if (u.includes("getCandleData")) {
      const req = JSON.parse(String(init?.body ?? "{}"));
      const base = req.exchange === "MCX" ? 120000 : 1140;
      const anchorMs = Date.now() - 86_400_000;
      const rows = Array.from({ length: 25 }, (_, i) => {
        const dayIso = new Date(anchorMs - (24 - i) * 86_400_000)
          .toISOString()
          .slice(0, 10);
        return [`${dayIso}T00:00:00+05:30`, base + i, base + i + 10, base + i - 5, base + i + 5, 10000 + i * 100];
      });
      return Response.json({ status: true, message: "SUCCESS", data: rows });
    }
    return new Response("Not found", { status: 404 });
  };
}

function buildWorkerHarness(env, getUser) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  }
  for (const user of ["owner", "alice"]) {
    sql
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)")
      .run(user, user, "2026-11-20T00:00:00Z", "2026-11-14-v4", 1, "2026-11-20T00:00:00Z");
  }
  class Statement {
    constructor(q, args = []) {
      this.q = q;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.q, args);
    }
    async first() {
      return sql.prepare(this.q).get(...this.args) ?? null;
    }
    async all() {
      return { results: sql.prepare(this.q).all(...this.args) };
    }
    async run() {
      const r = sql.prepare(this.q).run(...this.args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
  }
  const DB = { prepare: (q) => new Statement(q), async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); } };
  env.DB = DB;

  const context = vm.createContext({
    console,
    Date,
    Intl,
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
    fetch,
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
        account: async (subject) => sql.prepare("SELECT * FROM accounts WHERE subject=?").get(subject),
        rate: async () => {},
      });
    } else if (file.endsWith("/backend/auth/session.ts")) {
      m = synthetic(file, { getAuthenticatedUser: async () => getUser() });
    } else {
      const code = ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText;
      m = new vm.SourceTextModule(code, { context, identifier: file });
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
  return { load };
}

test("owner Classic coverage uses longer candle history and saves a daily scan only with eligible bars", async () => {
  const master = new InstrumentMaster();
  const requests = [];
  const nowMs = Date.now();
  const env = {
    X2_OWNER_SUBJECT: "owner",
    MARKET_DATA_PROVIDER: "angelone",
    MARKET_DATA_MODE: "private",
    ENABLE_PRIVATE_BROKER_DATA: "true",
    ENABLE_PUBLIC_EXCHANGE_QUOTES: "false",
    MARKET_ADAPTER_AUTH_TOKEN: FAKE_SERVICE_TOKEN,
    MARKET_DATA_ADAPTER: {
      async fetch(url) {
        const { pathname, searchParams } = new URL(url);
        assert.equal(pathname, "/internal/candles");
        const id = searchParams.get("id");
        const days = Number(searchParams.get("days"));
        assert.equal(searchParams.get("interval"), "1d");
        requests.push({ id, days });
        if (id === "NSE:RELIANCE") {
          return Response.json({
            errorCode: "BROKER_TOTP_REQUIRED",
            actionHint: "Reconnect the owner broker session.",
          }, { status: 401 });
        }
        const count = id === "BSE:SBIN" ? 124 : 215;
        const rows = [];
        for (let offset = 1; offset <= days && rows.length < count; offset++) {
          const date = new Date(nowMs - offset * 86_400_000);
          if ([0, 6].includes(date.getUTCDay())) continue;
          const close = 500 - rows.length;
          rows.push([`${date.toISOString().slice(0, 10)}T00:00:00+05:30`, close, close + 1, close - 1, close, 100]);
        }
        return Response.json(normalizeAngelOneCandles(master.resolve(id, nowMs), "1d", rows, nowMs));
      },
    },
  };
  let activeUser = { userId: "owner" };
  const harness = buildWorkerHarness(env, () => activeUser);
  const route = await harness.load("app/api/strategy/scan/route.ts");
  const base = "https://example.invalid";
  const call = async (action, id, extra = {}) => {
    const response = await route.POST(new Request(`${base}/api/strategy/scan`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        action,
        name: "Golden Cross study",
        description: "Daily Golden Cross fixture study.",
        formula: "crossesAbove(sma(close, 50), sma(close, 200))",
        mode: "SIMPLE",
        universe: "CONNECTED_MARKETS",
        instrumentIds: [id],
        ...extra,
      }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const ready = await call("preflight-scan", "NSE:SBIN");
  assert.equal(ready.status, 200);
  assert.equal(ready.body.preflight.minimumBars, 201);
  assert.equal(ready.body.preflight.eligible, 1);
  assert.ok(requests[0].days > 300 && requests[0].days <= 365);

  const short = await call("preflight-scan", "BSE:SBIN");
  assert.equal(short.body.preflight.blocked, true);
  assert.match(short.body.preflight.exclusions[0].reasons[0], /201 bars.*124 available/);
  const unavailable = await call("preflight-scan", "NSE:RELIANCE");
  assert.match(unavailable.body.preflight.reason, /BROKER_TOTP_REQUIRED/);

  const requestCount = requests.length;
  const intraday = await call("preflight-scan", "NSE:SBIN", { interval: "30m" });
  assert.match(intraday.body.preflight.reason, /30m/);
  const mislabeledCsv = await call("preflight-scan", "CSV:SBIN", {
    interval: "1h",
    customCsv: "symbol,date,close\nSBIN,2026-11-20,500",
  });
  assert.match(mislabeledCsv.body.preflight.reason, /Private CSV.*1h/);
  activeUser = { userId: "alice" };
  const member = await call("preflight-scan", "NSE:SBIN");
  assert.equal(member.body.preflight.blocked, true);
  assert.equal(requests.length, requestCount);

  activeUser = { userId: "owner" };
  const blocked = await call("run-scan", "BSE:SBIN", { requestId: webcrypto.randomUUID() });
  assert.equal(blocked.status, 422);
  assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM x1_scans").first()).count, 0);
  const requestId = webcrypto.randomUUID();
  const saved = await call("run-scan", "NSE:SBIN", { requestId });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.results.eligible, 1);
  assert.equal(saved.body.results.matches, 0);
  const row = await env.DB.prepare("SELECT payload FROM x1_scans WHERE id=?").bind(saved.body.id).first();
  assert.equal(JSON.parse(row.payload).datasets[0].observations.length, 215);
  assert.equal(saved.body.scanQuota.classic.used, 1);
  const replay = await call("run-scan", "NSE:SBIN", { requestId });
  assert.equal(replay.body.id, saved.body.id);
  assert.equal(replay.body.replayed, true);
});

test("full local loopback adapter + Cloudflare Worker route authorization, multi-exchange quotes, candles, offline degradation & zero leak", async () => {
  const adapter = await startMarketAdapterServer({
    env: {
      ANGELONE_API_KEY: FAKE_API_KEY,
      ANGELONE_CLIENT_ID: FAKE_CLIENT_ID,
      ANGELONE_MPIN: FAKE_MPIN,
      ANGELONE_TOTP_SECRET: FAKE_TOTP_SECRET,
      MARKET_ADAPTER_AUTH_TOKEN: FAKE_SERVICE_TOKEN,
      MARKET_ADAPTER_PORT: "18799",
      ANGELONE_CLIENT_PUBLIC_IP: "203.0.113.42",
    },
    fetcher: createMockAngelOneFetcher(),
    skipRemoteScripMaster: true,
  });

  try {
    // 1. Direct unauthenticated call to local adapter MUST fail closed with 401
    const unauthAdapter = await fetch(`http://127.0.0.1:${adapter.port}/internal/health`);
    assert.equal(unauthAdapter.status, 401);

    let activeUser = null;
    const workerEnv = {
      X2_OWNER_SUBJECT: "owner",
      MARKET_DATA_PROVIDER: "angelone",
      MARKET_DATA_MODE: "private",
      ENABLE_PRIVATE_BROKER_DATA: "true",
      ENABLE_PUBLIC_EXCHANGE_QUOTES: "false",
      MARKET_DATA_DEMO_MODE: "false",
      MARKET_DATA_ALLOW_LOOPBACK: "true",
      MARKET_DATA_ADAPTER_URL: `http://127.0.0.1:${adapter.port}`,
      MARKET_ADAPTER_AUTH_TOKEN: FAKE_SERVICE_TOKEN,
    };

    const harness = buildWorkerHarness(workerEnv, () => activeUser);
    const healthRoute = await harness.load("app/api/market/health/route.ts");
    const sessionRoute = await harness.load("app/api/market/session/route.ts");
    const quoteRoute = await harness.load("app/api/market/quote/route.ts");
    const candleRoute = await harness.load("app/api/market/candles/route.ts");
    const instRoute = await harness.load("app/api/market/instruments/route.ts");
    const dataService = await harness.load("backend/services/market-data/data-service.ts");

    // 2. Unauthenticated public visitor: health is sanitized, quote/candles return 401, but instrument identity discovery finds HDFC!
    const pubInstRes = await (await instRoute.GET(new Request("http://127.0.0.1:5173/api/market/instruments?q=HDFC"))).json();
    assert.equal(pubInstRes.accessScope, "PUBLIC_IDENTITY_ONLY");
    assert.equal(pubInstRes.instruments[0]?.id, "NSE:HDFCBANK");
    const pubHealth = await (await healthRoute.GET(new Request("http://127.0.0.1:5173/api/market/health"))).json();
    assert.equal(pubHealth.accessScope, "PUBLIC_RESTRICTED");
    assert.equal(pubHealth.authState, "HIDDEN");
    assert.equal((await quoteRoute.GET(new Request("http://127.0.0.1:5173/api/market/quote"))).status, 401);
    assert.equal((await candleRoute.GET(new Request("http://127.0.0.1:5173/api/market/candles?id=NSE:SBIN"))).status, 401);

    // 3. Authenticated NON-owner (alice) is strictly blocked (403 PUBLIC_LICENSE_REQUIRED)
    activeUser = { userId: "alice" };
    const aliceQuoteRes = await quoteRoute.GET(new Request("http://127.0.0.1:5173/api/market/quote?ids=NSE:SBIN"));
    assert.equal(aliceQuoteRes.status, 403);
    assert.equal((await aliceQuoteRes.json()).errorCode, "PUBLIC_LICENSE_REQUIRED");
    const aliceAsset = await dataService.assetResearch("NSE:SBIN", "alice");
    assert.equal(aliceAsset.candles.length, 0, "Non-owner must NEVER receive private broker candles");

    // 4. Authenticated OWNER receives verified normalized NSE, BSE, MCX quotes & candles!
    activeUser = { userId: "owner" };
    const ownerQuoteRes = await quoteRoute.GET(
      new Request("http://127.0.0.1:5173/api/market/quote?ids=NSE:SBIN,BSE:SBIN,MCX:GOLD04DEC26FUT"),
    );
    assert.equal(ownerQuoteRes.status, 200);
    const quoteBody = await ownerQuoteRes.json();
    assert.equal(quoteBody.quotes.length, 3);
    assert.equal(quoteBody.quotes.find((q) => q.id === "NSE:SBIN").ltp, 1165.1);
    assert.equal(quoteBody.quotes.find((q) => q.id === "BSE:SBIN").ltp, 1164.95);
    assert.equal(quoteBody.quotes.find((q) => q.id === "MCX:GOLD04DEC26FUT").ltp, 121778);
    assert.equal(quoteBody.quotes.find((q) => q.id === "MCX:GOLD04DEC26FUT").openInterest, 11430);
    assert.equal(quoteBody.quotes.find((q) => q.id === "NSE:SBIN").openInterest, null);

    // Verify ZERO secret leakage across quote payload
    const quoteText = JSON.stringify(quoteBody);
    for (const secret of [FAKE_API_KEY, FAKE_CLIENT_ID, FAKE_MPIN, FAKE_TOTP_SECRET, FAKE_SERVICE_TOKEN, "MOCK_REFRESH", "PRIVATE ACCOUNT HOLDER"]) {
      assert.equal(quoteText.includes(secret), false, `Secret leaked into API response: ${secret}`);
    }

    // Owner candles route + Asset Terminal / Soul Scan data-service integration
    const candleRes = await candleRoute.GET(
      new Request("http://127.0.0.1:5173/api/market/candles?id=MCX:GOLD04DEC26FUT&interval=1d&days=45"),
    );
    assert.equal(candleRes.status, 200);
    const candleBody = await candleRes.json();
    assert.equal(candleBody.candles.length, 25);

    // A production VPC binding routes through the private service and keeps its receiver.
    const binding = {
      requests: 0,
      async fetch(url, init) {
        this.requests += 1;
        const target = new URL(url);
        assert.equal(target.origin, "http://angelone-adapter.internal");
        assert.equal(init.headers["X-SS-Adapter-Token"], FAKE_SERVICE_TOKEN);
        assert.equal(init.headers["CF-Access-Client-Secret"], undefined);
        return fetch(`http://127.0.0.1:${adapter.port}${target.pathname}${target.search}`, init);
      },
    };
    const boundHarness = buildWorkerHarness(
      {
        ...workerEnv,
        MARKET_DATA_ALLOW_LOOPBACK: "false",
        MARKET_DATA_ADAPTER_URL: undefined,
        MARKET_DATA_ADAPTER: binding,
        CF_ACCESS_CLIENT_ID: "test",
        CF_ACCESS_CLIENT_SECRET: "test",
      },
      () => activeUser,
    );
    const boundRoute = await boundHarness.load("app/api/market/quote/route.ts");
    const boundRequest = new Request("https://example.invalid/api/market/quote?ids=NSE:SBIN");
    activeUser = { userId: "alice" };
    assert.equal((await boundRoute.GET(boundRequest)).status, 403);
    assert.equal(binding.requests, 0);
    activeUser = { userId: "owner" };
    const boundResponse = await boundRoute.GET(boundRequest);
    assert.equal(boundResponse.status, 200);
    assert.equal((await boundResponse.json()).quotes[0].id, "NSE:SBIN");
    assert.equal(binding.requests, 1);

    const overview = await boundHarness.load("backend/services/market-data/nine-card-markets.ts");
    const snapshot = { asOf: new Date().toISOString(), quotes: [], yields: [], fxHistory: [] };
    const layoutIds = ["NSE:SBIN", ...overview.DEFAULT_NINE_CARD_IDS.slice(1)];
    await overview.saveUserMarketLayout("owner", 0, layoutIds);
    await overview.saveUserMarketLayout("alice", 0, layoutIds);
    const memberCards = (await overview.getMarketOverviewPayload("alice", snapshot)).cards;
    assert.equal(memberCards[0].value, null);
    assert.equal(binding.requests, 1);
    const ownerCards = (await overview.getMarketOverviewPayload("owner", snapshot)).cards;
    assert.equal(ownerCards[0].value, 1165.1);
    assert.equal(ownerCards[0].redistributable, false);
    assert.equal(ownerCards[0].currency, "INR");
    assert.equal(ownerCards[0].quoteUnit, "INR per share");
    assert.equal(binding.requests, 2);

    const ownerAsset = await dataService.assetResearch("NSE:SBIN", "owner");
    assert.equal(ownerAsset.candles.length, 25);
    assert.equal(ownerAsset.provider, "Angel One SmartAPI (Private Owner)");

    const ownerUniverse = await dataService.researchUniverse("owner", {
      provider: "CONNECTED_MARKETS",
      instrumentIds: ["NSE:SBIN"],
    });
    assert.equal(ownerUniverse.datasets.length, 1);

    // Full unscoped owner universe evaluates all verified seeds (no hidden .slice(0, 5) truncation!)
    const fullOwnerUniverse = await dataService.researchUniverse("owner", {
      provider: "CONNECTED_MARKETS",
    });
    assert.ok(
      fullOwnerUniverse.datasets.length >= 12,
      `Expected >=12 owner broker instruments evaluated without .slice(0,5) cap, got ${fullOwnerUniverse.datasets.length}`,
    );
    assert.ok(
      fullOwnerUniverse.datasets.some((d) => d.instrumentId === "NSE:HDFCBANK"),
      "Full owner scan universe must include NSE:HDFCBANK",
    );

    // Session endpoint works independently
    const sessBody = await (await sessionRoute.GET()).json();
    assert.ok(sessBody.sessions.NSE && sessBody.sessions.BSE && sessBody.sessions.MCX);

    // 5. Explicit DEMO mode produces unmistakably labeled DEMO / SYNTHETIC data
    workerEnv.MARKET_DATA_DEMO_MODE = "true";
    const demoBody = await (await quoteRoute.GET(new Request("http://127.0.0.1:5173/api/market/quote?ids=NSE:SBIN"))).json();
    assert.equal(demoBody.sourceMode, "DEMO_SYNTHETIC");
    assert.equal(demoBody.quotes[0].quality, "DEMO");
    assert.equal(demoBody.quotes[0].isLive, false);
    workerEnv.MARKET_DATA_DEMO_MODE = "false";

    // 6. Shut down adapter -> Worker returns clean 503 ADAPTER_OFFLINE without crashing!
    await adapter.close();
    const offlineRes = await quoteRoute.GET(new Request("http://127.0.0.1:5173/api/market/quote?ids=NSE:SBIN"));
    assert.equal(offlineRes.status, 503);
    assert.equal((await offlineRes.json()).errorCode, "ADAPTER_OFFLINE");
  } finally {
    await adapter.close().catch(() => {});
  }
});
