import "../../tooling/ts-node-hooks.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const {
  istCalendarDate,
  summarizePortfolio,
  validateTransaction,
} = await import("../../backend/engines/portfolio.ts");
const {
  EXCHANGE_CALENDAR_METADATA,
  getExchangeSessionWindowMinutes,
  getIndianExchangeSession,
  getNymexGlobexSession,
} = await import("../../backend/services/market-data/exchange-calendar.ts");
const {
  getIndianExchangeSession: getBrokerIndianSession,
} = await import("../../backend/services/market-data/angelone/calendar.ts");
const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");
const {
  DEFAULT_EIGHT_CARD_IDS,
  normalizeMarketTileId,
  reconcileGlobalMarketIds,
} = await import("../../backend/services/market-data/nine-card-types.ts");
const { buildSectorHeatmaps } = await import(
  "../../backend/services/market-data/sectors-and-ecosystem.ts"
);
const { safeCsvCell } = await import(
  "../../frontend/features/strategy/scan-helpers.ts"
);

test("X3-023: exact decimal portfolio closes fractional holdings cleanly and rejects genuine oversell", () => {
  const summary = summarizePortfolio(
    [
      { kind: "BUY", symbol: "NSE:TCS", quantity: 0.3, price: 4000, fees: 3, currency: "INR", date: "2026-11-20" },
      { kind: "SELL", symbol: "NSE:TCS", quantity: 0.1, price: 4100, fees: 1, currency: "INR", date: "2026-11-21" },
      { kind: "SELL", symbol: "NSE:TCS", quantity: 0.2, price: 4200, fees: 2, currency: "INR", date: "2026-11-22" },
    ],
    "INR",
    "2026-11-28T01:00:00+05:30",
  );
  assert.equal(summary.holdings.length, 1);
  assert.equal(summary.holdings[0].quantity, 0);
  assert.equal(summary.holdings[0].basis, 0);
  assert.equal(summary.holdings[0].averageCost, 0);
  assert.equal(summary.investedCost, 0);
  // Gross buy = 1200 + 3 = 1203; net sells = (410 - 1) + (840 - 2) = 1247 => realized = +44
  assert.equal(summary.realized, 44);
  assert.equal(summary.cash, 44);

  // Genuine oversell by 0.0000000005 must still fail
  assert.throws(
    () =>
      summarizePortfolio(
        [
          { kind: "BUY", symbol: "NSE:TCS", quantity: 0.3, price: 4000, fees: 0, currency: "INR", date: "2026-11-20" },
          { kind: "SELL", symbol: "NSE:TCS", quantity: 0.1, price: 4100, fees: 0, currency: "INR", date: "2026-11-21" },
          { kind: "SELL", symbol: "NSE:TCS", quantity: 0.2000000005, price: 4200, fees: 0, currency: "INR", date: "2026-11-22" },
        ],
        "INR",
        "2026-11-28T01:00:00+05:30",
      ),
    /exceeds recorded holdings/i,
  );

  // Non-finite values rejected
  assert.throws(() =>
    validateTransaction(
      { kind: "BUY", symbol: "NSE:SBIN", quantity: Number.NaN, price: 100, fees: 0, currency: "INR", date: "2026-11-20" },
      "2026-11-28T01:00:00+05:30",
    ),
  );
});

test("X3-024: portfolio date validation uses Asia/Kolkata business date at midnight, 01:00 IST, and 05:30 IST", () => {
  // 2026-11-28 00:00:01 IST = 2026-11-27T18:30:01Z
  assert.equal(istCalendarDate("2026-11-27T18:30:01Z"), "2026-11-28");
  // 2026-11-28 01:00:00 IST = 2026-11-27T19:30:00Z (historical bug rejected 2026-11-28 due to UTC 2026-11-27)
  const oneAmIstUtc = "2026-11-27T19:30:00.000Z";
  assert.equal(istCalendarDate(oneAmIstUtc), "2026-11-28");
  const valid = validateTransaction(
    { kind: "BUY", symbol: "NSE:SBIN", quantity: 1, price: 800, fees: 0, currency: "INR", date: "2026-11-28" },
    oneAmIstUtc,
  );
  assert.equal(valid.date, "2026-11-28");
  // Next IST day (2026-11-29) must still be rejected as future
  assert.throws(() =>
    validateTransaction(
      { kind: "BUY", symbol: "NSE:SBIN", quantity: 1, price: 800, fees: 0, currency: "INR", date: "2026-11-29" },
      oneAmIstUtc,
    ),
  );
  // 05:30 IST = 00:00 UTC same date
  assert.equal(istCalendarDate("2026-11-28T00:00:00.000Z"), "2026-11-28");
});

test("X3-020 & X3-021: unified calendar agrees across exchange-calendar, broker gateway, and daily-pulse for 1 Feb 2026 & 2027", () => {
  const budgetTs = Date.parse("2026-02-01T11:30:00+05:30");
  const nseCore = getIndianExchangeSession("NSE", budgetTs);
  const nseBroker = getBrokerIndianSession("NSE", budgetTs);

  assert.equal(nseCore.state, "OPEN");
  assert.equal(nseBroker.state, "OPEN");
  assert.equal(nseCore.label, nseBroker.label);
  assert.deepEqual(getExchangeSessionWindowMinutes("NSE", "2026-02-01"), {
    openMinutes: 555,
    closeMinutes: 930,
  });
  const dailyPulseSrc = readFileSync(
    resolve(process.cwd(), "backend/services/market-data/daily-pulse.ts"),
    "utf8",
  );
  assert.match(dailyPulseSrc, /getExchangeSessionWindowMinutes\("NSE",\s*ymd\)/);

  // Regular Sunday stays CLOSED
  const normalSun = Date.parse("2026-02-08T11:30:00+05:30");
  assert.equal(getIndianExchangeSession("NSE", normalSun).state, "CLOSED");
  assert.equal(getExchangeSessionWindowMinutes("NSE", "2026-02-08"), null);

  // 2027 coverage & metadata
  assert.equal(EXCHANGE_CALENDAR_METADATA.verifiedThrough, "2027-12-31");
  assert.equal(getIndianExchangeSession("NSE", Date.parse("2027-01-26T11:00:00+05:30")).state, "HOLIDAY");
  assert.equal(getIndianExchangeSession("NSE", Date.parse("2027-02-02T11:00:00+05:30")).state, "OPEN");
  assert.equal(getNymexGlobexSession(Date.parse("2027-03-26T12:00:00-04:00")).state, "HOLIDAY");
  // Unknown year (2028) fails closed to SCHEDULE_UNKNOWN
  assert.equal(getIndianExchangeSession("NSE", Date.parse("2028-02-02T11:00:00+05:30")).state, "SCHEDULE_UNKNOWN");
  assert.equal(getNymexGlobexSession(Date.parse("2028-02-02T12:00:00-05:00")).state, "SCHEDULE_UNKNOWN");
});

test("X3-022: generic GLOBAL:CL replaces hardcoded GLOBAL:CLF27 while migrating legacy layouts", () => {
  assert.ok(DEFAULT_EIGHT_CARD_IDS.includes("GLOBAL:CL"));
  assert.ok(!DEFAULT_EIGHT_CARD_IDS.includes("GLOBAL:CLF27"));
  assert.equal(normalizeMarketTileId("GLOBAL:CLF27"), "GLOBAL:CL");
  assert.equal(normalizeMarketTileId("GLOBAL:CLM28"), "GLOBAL:CL");
  const reconciled = reconcileGlobalMarketIds(["GLOBAL:CLF27", "NSE:NIFTY"]);
  assert.equal(reconciled[0], "GLOBAL:CL");
  assert.equal(reconciled.length, 8);
});

test("X3-018 & X3-019: heatmap handles case-insensitive lookups, stale prices, and aligned breadth", () => {
  const quoteMap = new Map([
    ["nse:hdfcbank", { value: 1650, pctChange: 0.03, unit: "INR", provider: "TestFeed", quality: "PUBLISHED_EOD" }],
    ["NSE:ICICIBANK", { value: 1200, pctChange: 1.8, unit: "INR", provider: "TestFeed", quality: "PUBLISHED_EOD" }],
    ["NSE:SBIN", { value: 810, pctChange: -0.9, unit: "INR", provider: "TestFeed", quality: "STALE" }],
  ]);
  const [bank] = buildSectorHeatmaps(quoteMap);
  const hdfc = bank.tiles.find((t) => t.id === "NSE:HDFCBANK");
  const icici = bank.tiles.find((t) => t.id === "NSE:ICICIBANK");
  const sbin = bank.tiles.find((t) => t.id === "NSE:SBIN");
  assert.equal(hdfc?.tone, "FLAT");
  assert.equal(icici?.tone, "UP_STRONG");
  // Stale quote must not display numeric price/pctChange as current
  assert.equal(sbin?.tone, "UNAVAILABLE");
  assert.equal(sbin?.pctChange, null);
  assert.equal(sbin?.price, null);
  assert.equal(sbin?.stale, true);
  // Breadth agrees with tone bands (FLAT counted in unchanged, not advancers)
  assert.equal(bank.advancers, 1);
  assert.equal(bank.decliners, 0);
  assert.equal(bank.unchanged, 1);
});

test("X3-038: CSV preserves negative numbers and escapes spreadsheet injection formulas", () => {
  assert.equal(safeCsvCell(-2.5), "-2.5");
  assert.equal(safeCsvCell("-2.5"), "-2.5");
  assert.equal(safeCsvCell("0"), "0");
  assert.equal(safeCsvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(safeCsvCell("-2+3"), "'-2+3");
  assert.equal(safeCsvCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(safeCsvCell("@CMD"), "'@CMD");
  assert.equal(safeCsvCell("line1\nline2"), '"line1\nline2"');
});
