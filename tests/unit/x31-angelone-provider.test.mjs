/**
 * Deterministic unit tests for Angel One read-only provider, calendar, normalizer,
 * TOTP, rate limiter, circuit breaker, redaction, and zero-order safety invariants.
 * Never uses real credentials.
 */

import "../../operations/scripts/ts-node-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const {
  classifyQuoteQuality,
  getIndianExchangeSession,
  qualityDisplayLabel,
} = await import("../../backend/services/market-data/angelone/calendar.ts");
const {
  InstrumentMaster,
  normalizeScripMasterRow,
} = await import("../../backend/services/market-data/angelone/instrument-master.ts");
const {
  normalizeAngelOneCandles,
  normalizeAngelOneQuote,
  paiseToRupees,
  parseAngelOneExpiry,
  parseAngelOneIstTimestamp,
} = await import("../../backend/services/market-data/angelone/normalizer.ts");
const {
  parseAdapterConfig,
  parseGatewayConfig,
  redactText,
} = await import("../../backend/services/market-data/angelone/redact.ts");
const {
  generateTotpCode,
  isValidSixDigitTotp,
} = await import("../../backend/services/market-data/angelone/totp.ts");
const { BrokerAuthSession } = await import(
  "../../backend/services/market-data/angelone/auth-session.ts"
);
const { AngelOneReadOnlyProvider } = await import(
  "../../backend/services/market-data/angelone/provider.ts"
);
const { brokerScanLookbackDays, completedBrokerObservations } = await import(
  "../../backend/services/market-data/angelone/scan-history.ts"
);
const { CLASSIC_50_PRESETS, findClassicPresetByFormula } = await import(
  "../../backend/services/research/classic-presets.ts"
);
const { compileFormula } = await import("../../backend/engines/scan.ts");

test("Classic candle lookback uses each canonical preset's published minimum", () => {
  for (const preset of CLASSIC_50_PRESETS) {
    assert.equal(findClassicPresetByFormula(compileFormula(preset.formula).formula), preset);
  }
  assert.ok(brokerScanLookbackDays("1d", 201) > 300);
  assert.ok(brokerScanLookbackDays("1d", 201) <= 365);
  assert.ok(brokerScanLookbackDays("1d", 16) < brokerScanLookbackDays("1d", 201));
});

test("broker scan history preserves source timestamps and drops developing periods", () => {
  const days = ["2026-09-30", "2026-10-19", "2026-10-23", "2026-11-10", "2026-11-16", "2026-11-20", "2026-11-23"];
  const rows = days.map((day, index) => [
    `${day}T00:00:00+05:30`, 100 + index, 115 + index, 95, 105 + index, 10,
  ]);
  const instrument = new InstrumentMaster().resolve("NSE:SBIN");
  const seriesAt = (time) => normalizeAngelOneCandles(
    instrument, "1d", rows, Date.parse(`2026-11-23T${time}+05:30`),
  );
  const during = seriesAt("15:29:59");
  const after = seriesAt("15:30:00");
  assert.equal(completedBrokerObservations(during, "1d").at(-1).eventAt, during.candles.at(-2).timestampUTC);
  assert.equal(completedBrokerObservations(after, "1d").at(-1).eventAt, after.candles.at(-1).timestampUTC);
  const weekly = completedBrokerObservations(during, "1wk");
  assert.equal(weekly.at(-1).eventAt, during.candles.at(-2).timestampUTC);
  assert.equal(weekly.at(-1).volume, 20);
  const monthly = completedBrokerObservations(after, "1mo");
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0].eventAt, during.candles[2].timestampUTC);
  assert.equal(monthly[0].knownAt, after.retrievalTimestampUTC);
});

test("RFC 6238 SHA-1 TOTP matches official test vector and validates 6-digit manual codes", async () => {
  // RFC 6238 test secret ASCII "12345678901234567890" -> Base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  // At T = 59s (step 30 -> counter 1), 8-digit value is 94287082 -> 6-digit value is 287082
  const r = await generateTotpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000, 30, 6);
  assert.equal(r.code, "287082");
  assert.equal(isValidSixDigitTotp("287082"), true);
  assert.equal(isValidSixDigitTotp("12345"), false);
  assert.equal(isValidSixDigitTotp("abcdef"), false);
});

test("redactText and fail-closed env parsers scrub secrets and enforce safe defaults", () => {
  const raw = "Failed for clientcode=TESTCLIENT01 Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig12345678901234567890 api_key=MYSECRETKEY99";
  const clean = redactText(raw, ["MYSECRETKEY99", "TESTCLIENT01"]);
  assert.ok(!clean.includes("MYSECRETKEY99"));
  assert.ok(!clean.includes("TESTCLIENT01"));
  assert.ok(!clean.includes("eyJhbGci"));

  const missing = parseAdapterConfig({ ANGELONE_API_KEY: "REPLACE_ME" });
  assert.equal(missing.ok, false);

  const FAKE_PIN = ["12", "34"].join("");
  const valid = parseAdapterConfig({
    ANGELONE_API_KEY: "FAKE_API_KEY",
    ANGELONE_CLIENT_ID: "TEST_12345".replace("_", ""),
    ANGELONE_MPIN: FAKE_PIN,
    MARKET_ADAPTER_AUTH_TOKEN: "TEST_SERVICE_TOKEN_AT_LEAST_24_CHARS",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.config.bindHost, "127.0.0.1");
    assert.equal(valid.config.totpSecret, null);
  }

  // Gateway defaults: public exchange quotes OFF, demo mode OFF, HTTP non-loopback rejected
  const gwDefault = parseGatewayConfig({
    ENABLE_PUBLIC_EXCHANGE_QUOTES: "true",
    MARKET_DATA_MODE: "private",
    MARKET_DATA_ADAPTER_URL: "http://example.com:8791",
  });
  assert.equal(gwDefault.flags.enablePublicExchangeQuotes, false);
  assert.equal(gwDefault.flags.demoMode, false);
  assert.equal(gwDefault.adapterUrl, null);
});

test("2026 Indian exchange calendar separates weekends, holidays, MCX evening sessions, and live open windows", () => {
  // Saturday 21 Nov 2026 10:30 IST -> CLOSED on NSE, BSE, MCX
  const satMs = Date.parse("2026-11-21T10:30:00+05:30");
  for (const ex of ["NSE", "BSE", "MCX"]) {
    const s = getIndianExchangeSession(ex, satMs);
    assert.equal(s.state, "CLOSED");
    const q = classifyQuoteQuality({
      ltp: 1165.1,
      observationTimeMs: Date.parse("2026-11-20T15:59:46+05:30"),
      retrievalTimeMs: satMs,
      nowMs: satMs,
      session: s,
    });
    assert.equal(q.quality, "MARKET_CLOSED_LAST");
    assert.equal(q.isLive, false);
  }

  // Good Friday 03 Apr 2026 11:00 IST -> HOLIDAY on NSE, BSE, MCX
  const gfMs = Date.parse("2026-04-03T11:00:00+05:30");
  assert.equal(getIndianExchangeSession("NSE", gfMs).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("MCX", gfMs).state, "HOLIDAY");

  // Holi 03 Mar 2026 -> NSE HOLIDAY all day; MCX morning HOLIDAY, evening OPEN at 19:00 IST
  const holiMorning = Date.parse("2026-03-03T11:00:00+05:30");
  const holiEvening = Date.parse("2026-03-03T19:00:00+05:30");
  assert.equal(getIndianExchangeSession("NSE", holiEvening).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("MCX", holiMorning).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("MCX", holiEvening).state, "OPEN");

  // Regular Friday open 20 Nov 2026 11:00 IST: fresh 15s tick -> VERIFIED_REAL_LIVE; 5m -> DELAYED; 25m -> STALE
  const openMs = Date.parse("2026-11-20T11:00:00+05:30");
  const nseOpen = getIndianExchangeSession("NSE", openMs);
  assert.equal(nseOpen.state, "OPEN");
  assert.equal(
    classifyQuoteQuality({ ltp: 100, observationTimeMs: openMs - 15_000, retrievalTimeMs: openMs, nowMs: openMs, session: nseOpen }).quality,
    "VERIFIED_REAL_LIVE",
  );
  assert.equal(
    classifyQuoteQuality({ ltp: 100, observationTimeMs: openMs - 5 * 60_000, retrievalTimeMs: openMs, nowMs: openMs, session: nseOpen }).quality,
    "VERIFIED_REAL_DELAYED",
  );
  assert.equal(
    classifyQuoteQuality({ ltp: 100, observationTimeMs: openMs - 25 * 60_000, retrievalTimeMs: openMs, nowMs: openMs, session: nseOpen }).quality,
    "REAL_BUT_STALE",
  );

  // Unverified year (2027) -> SCHEDULE_UNKNOWN, never LIVE
  const nextYear = Date.parse("2027-02-02T11:00:00+05:30");
  assert.equal(getIndianExchangeSession("NSE", nextYear).state, "SCHEDULE_UNKNOWN");
  assert.equal(qualityDisplayLabel("MARKET_CLOSED_LAST"), "MARKET CLOSED · LAST");
});

test("paise conversion, timestamp parsing, epoch-zero fallback, zero/null safe change, and MCX futures normalization", () => {
  assert.equal(paiseToRupees("5.000000"), 0.05);
  assert.equal(paiseToRupees("100.000000"), 1);
  assert.equal(paiseToRupees("0"), null);
  assert.equal(parseAngelOneExpiry("04DEC2026"), "2026-12-04");
  assert.equal(parseAngelOneIstTimestamp("01-Jan-1970 05:30:00"), null);

  const satMs = Date.parse("2026-11-21T10:30:00+05:30");
  const master = new InstrumentMaster();
  const nseSbin = master.resolve("NSE:SBIN", satMs);
  const bseSbin = master.resolve("BSE:SBIN", satMs);
  const nifty = master.resolve("NSE:NIFTY", satMs);
  const mcxGold = master.resolve("MCX:GOLD04DEC26FUT", satMs);

  // Compound identity check: NSE token != BSE token
  assert.equal(nseSbin.token, "3045");
  assert.equal(bseSbin.token, "500112");
  assert.notEqual(nseSbin.token, bseSbin.token);

  // Equity quote: prefers Friday exchTradeTime over Saturday BOD exchFeedTime, strips cash equity OI
  const eqNorm = normalizeAngelOneQuote(
    nseSbin,
    {
      ltp: 1165.1,
      open: 1150,
      high: 1174.9,
      low: 1144,
      close: 1156,
      tradeVolume: 17524838,
      opnInterest: 230687250,
      exchFeedTime: "21-Nov-2026 06:55:06",
      exchTradeTime: "20-Nov-2026 15:59:46",
    },
    satMs,
  );
  assert.equal(eqNorm.quality, "MARKET_CLOSED_LAST");
  assert.equal(eqNorm.isLive, false);
  assert.equal(eqNorm.openInterest, null);
  assert.equal(eqNorm.change, 9.1);
  assert.ok(eqNorm.exchangeTimestampUTC.startsWith("2026-11-20T10:29:46"));

  // Index quote with epoch-zero trade time falls back to exchFeedTime and nulls zero volume
  const idxNorm = normalizeAngelOneQuote(
    nifty,
    {
      ltp: 25800.6,
      close: 0, // invalid denominator -> change & changePct must be null!
      tradeVolume: 0,
      exchFeedTime: "20-Nov-2026 16:08:12",
      exchTradeTime: "01-Jan-1970 05:30:00",
    },
    satMs,
  );
  assert.equal(idxNorm.change, null);
  assert.equal(idxNorm.changePct, null);
  assert.equal(idxNorm.volume, null);
  assert.ok(idxNorm.exchangeTimestampUTC.startsWith("2026-11-20T10:38:12"));

  // MCX futures preserves expiry, lot size, tick size, and real open interest
  const mcxNorm = normalizeAngelOneQuote(
    mcxGold,
    {
      ltp: 121778,
      open: 123629,
      high: 123975,
      low: 121424,
      close: 121778,
      tradeVolume: 15370,
      opnInterest: 11430,
      exchTradeTime: "20-Nov-2026 23:54:47",
    },
    satMs,
  );
  assert.equal(mcxNorm.openInterest, 11430);
  assert.equal(mcxNorm.expiry, "2026-12-04");
  assert.equal(mcxNorm.lotSize, 1);
  assert.equal(mcxNorm.tickSize, 1);

  // Expired MCX contract rejected during ScripMaster normalization
  const expired = normalizeScripMasterRow(
    {
      token: "999999",
      symbol: "GOLD05OCT25FUT",
      name: "GOLD",
      expiry: "05OCT2025",
      lotsize: "1",
      instrumenttype: "FUTCOM",
      exch_seg: "MCX",
      tick_size: "100.000000",
    },
    satMs,
  );
  assert.equal(expired, null);

  // Candle normalizer filters impossible OHLC & future dates
  const series = normalizeAngelOneCandles(
    nseSbin,
    "1d",
    [
      ["2026-11-19T00:00:00+05:30", 1140, 1160, 1135, 1156, 12000000],
      ["2026-11-20T00:00:00+05:30", 1150, 1100, 1144, 1165.1, 100], // invalid high < close
      ["2099-01-01T00:00:00+05:30", 1150, 1170, 1140, 1160, 100], // future bar
    ],
    satMs,
  );
  assert.equal(series.candles.length, 1);
  assert.equal(series.candles[0].close, 1156);
});

test("BrokerAuthSession handles AB1050 invalid TOTP, 403 static IP block, and one-shot refreshToken renewal without login loops", async () => {
  const satMs = Date.parse("2026-11-21T10:30:00+05:30");
  let loginCalls = 0;
  let refreshCalls = 0;
  let quoteCalls = 0;

  // 1. Invalid TOTP -> fails immediately without retrying
  const totpAuth = new BrokerAuthSession(
    {
      apiKey: "FAKEKEY",
      clientId: "FAKECLIENT",
      mpin: "1234",
      totpSecret: null,
      localIp: "127.0.0.1",
      publicIp: "203.0.113.10",
      macAddress: "00:00:00:00:00:00",
    },
    async () => {
      loginCalls += 1;
      return Response.json({ status: false, message: "Invalid totp", errorcode: "AB1050" });
    },
  );
  await assert.rejects(() => totpAuth.login("123456", satMs), (err) => err.code === "BROKER_TOTP_REQUIRED");
  assert.equal(loginCalls, 1, "Invalid TOTP must NEVER retry in a loop");

  // 2. Static IP 403 -> surfaces BROKER_STATIC_IP_BLOCKED immediately
  const ipAuth = new BrokerAuthSession(
    {
      apiKey: "FAKEKEY",
      clientId: "FAKECLIENT",
      mpin: "1234",
      totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      localIp: "127.0.0.1",
      publicIp: "203.0.113.10",
      macAddress: "00:00:00:00:00:00",
    },
    async () =>
      new Response(JSON.stringify({ status: false, message: "Static IP mismatch" }), { status: 403 }),
  );
  await assert.rejects(() => ipAuth.login(undefined, satMs), (err) => err.code === "BROKER_STATIC_IP_BLOCKED");

  // 3. Expired token on quote -> performs ONE refreshToken call, then succeeds; candle failure stays independent!
  const mockFetcher = async (url) => {
    const u = String(url);
    if (u.includes("loginByPassword")) {
      return Response.json({
        status: true,
        message: "SUCCESS",
        data: { jwtToken: "JWT_INITIAL", refreshToken: "REF_1", feedToken: "FEED_1" },
      });
    }
    if (u.includes("getProfile")) {
      return Response.json({
        status: true,
        data: { exchanges: ["nse_cm", "bse_cm", "mcx_fo"], name: "SECRET_NAME_PII" },
      });
    }
    if (u.includes("generateTokens")) {
      refreshCalls += 1;
      return Response.json({
        status: true,
        message: "SUCCESS",
        data: { jwtToken: "JWT_REFRESHED" },
      });
    }
    if (u.includes("/market/v1/quote/")) {
      quoteCalls += 1;
      if (quoteCalls === 1) {
        return new Response(JSON.stringify({ status: false, errorcode: "AG8001", message: "Invalid Token" }), { status: 401 });
      }
      return Response.json({
        status: true,
        data: {
          fetched: [
            {
              exchange: "NSE",
              tradingSymbol: "SBIN-EQ",
              symbolToken: "3045",
              ltp: 1165.1,
              open: 1150,
              high: 1174.9,
              low: 1144,
              close: 1156,
              tradeVolume: 1000,
              exchTradeTime: "20-Nov-2026 15:59:46",
            },
          ],
          unfetched: [],
        },
      });
    }
    if (u.includes("getCandleData")) {
      return new Response(JSON.stringify({ status: false, message: "Rate limit" }), { status: 429 });
    }
    return new Response("Not found", { status: 404 });
  };

  const auth = new BrokerAuthSession(
    {
      apiKey: "FAKEKEY",
      clientId: "FAKECLIENT",
      mpin: "1234",
      totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      localIp: "127.0.0.1",
      publicIp: "203.0.113.10",
      macAddress: "00:00:00:00:00:00",
    },
    mockFetcher,
  );
  const provider = new AngelOneReadOnlyProvider(auth, new InstrumentMaster(), mockFetcher, ["FAKEKEY", "FAKECLIENT", "1234"]);

  const quotes = await provider.getQuotes(["NSE:SBIN"], satMs);
  assert.equal(refreshCalls, 1);
  assert.equal(quotes.quotes.length, 1);
  assert.equal(quotes.quotes[0].ltp, 1165.1);
  assert.ok(!JSON.stringify(quotes).includes("SECRET_NAME_PII"));

  // Candles 429 fails independently without breaking health/quotes
  await assert.rejects(() => provider.getCandles("NSE:SBIN", "1d", 30, satMs + 2000), (err) => err.code === "RATE_LIMITED");
  const health = provider.getHealth(satMs + 2000);
  assert.deepEqual(health.enabledExchanges, ["NSE", "BSE", "MCX"]);
  assert.equal(health.ok, true);
});

test("ZERO-ORDER SAFETY GUARD: no order, GTT, position mutation, or funds endpoints exist in market-data modules", () => {
  const dirs = [
    resolve("backend/services/market-data/angelone"),
    resolve("app/api/market"),
  ];
  const forbidden = /\b(placeOrder|modifyOrder|cancelOrder|placeGtt|gtt\/v1|order\/v1|rms\/v1\/getRMS|convertPosition)\b/i;
  let checked = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        checked += 1;
        const src = readFileSync(full, "utf8");
        assert.equal(forbidden.test(src), false, `Forbidden trading endpoint reference found in ${full}`);
      }
    }
  }
  for (const dir of dirs) walk(dir);
  assert.ok(checked >= 15, `Expected to inspect >= 15 market-data files, inspected ${checked}`);
});
