import test from "node:test";
import assert from "node:assert/strict";
import {
  bsm,
  impliedVolatility,
  cagr,
  xirr,
  historicalInvestment,
} from "../lib/x1/math.ts";
const standard = {
  spot: 100,
  strike: 100,
  years: 1,
  rate: 0.05,
  dividendYield: 0,
  volatility: 0.2,
};
const near = (actual, expected, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
test("BSM benchmark, positional compatibility and dividend put-call parity", () => {
  const v = bsm(standard);
  near(v.call, 10.45058357, 2e-5);
  near(v.put, 5.57352602, 2e-5);
  near(bsm(100, 100, 1, 0.05, 0, 0.2).call, v.call);
  for (const s of [1, 40, 100, 500])
    for (const t of [0.001, 0.3, 2])
      for (const q of [0, 0.03]) {
        const p = { ...standard, spot: s, years: t, dividendYield: q },
          r = bsm(p);
        near(
          r.call - r.put,
          s * Math.exp(-q * t) - 100 * Math.exp(-0.05 * t),
          1e-8,
        );
        assert.ok(r.call >= 0 && r.put >= 0);
      }
});
test("analytic Greeks agree with independent finite-difference price sensitivities", () => {
  const p = { ...standard, dividendYield: 0.02 },
    v = bsm(p),
    h = 0.01,
    up = bsm({ ...p, spot: p.spot + h }),
    down = bsm({ ...p, spot: p.spot - h });
  near((up.call - down.call) / (2 * h), v.callDelta, 3e-5);
  near((up.call - 2 * v.call + down.call) / (h * h), v.gamma, 2e-5);
  const dv = 0.0001;
  near(
    (bsm({ ...p, volatility: p.volatility + dv }).call -
      bsm({ ...p, volatility: p.volatility - dv }).call) /
      (2 * dv) /
      100,
    v.vega,
    2e-5,
  );
  near(
    (bsm({ ...p, rate: p.rate + dv }).call -
      bsm({ ...p, rate: p.rate - dv }).call) /
      (2 * dv) /
      100,
    v.callRho,
    2e-5,
  );
  near(
    (bsm({ ...p, years: p.years - dv }).call -
      bsm({ ...p, years: p.years + dv }).call) /
      (2 * dv) /
      365,
    v.callTheta,
    2e-5,
  );
});
test("expiry and zero-volatility limits are explicit and finite where defined", () => {
  const expired = bsm({ ...standard, years: 0, spot: 120 });
  assert.equal(expired.call, 20);
  assert.equal(expired.put, 0);
  assert.equal(expired.callDelta, 1);
  assert.equal(expired.gamma, null);
  assert.equal(expired.callTheta, null);
  assert.equal(bsm({ ...standard, years: 0 }).callDelta, 0.5);
  const zero = bsm({ ...standard, volatility: 0 });
  near(zero.call, 100 - 100 * Math.exp(-0.05), 1e-10);
  assert.equal(zero.put, 0);
  assert.equal(zero.gamma, 0);
  const kink = bsm({ ...standard, volatility: 0, rate: 0 });
  assert.equal(kink.call, 0);
  assert.equal(kink.gamma, null);
});
test("BSM rejects invalid assumptions and remains stable for deep tails and small expiry", () => {
  for (const bad of [
    { spot: 0 },
    { strike: -1 },
    { years: -1 },
    { volatility: -0.1 },
    { rate: 2 },
    { dividendYield: NaN },
    { volatility: 6 },
  ])
    assert.throws(() => bsm({ ...standard, ...bad }));
  for (const p of [
    { spot: 1, strike: 1e6, years: 1e-9, volatility: 0.01 },
    { spot: 1e6, strike: 1, years: 1e-9, volatility: 1 },
    {
      spot: 1,
      strike: 1,
      years: 100,
      rate: -1,
      dividendYield: 1,
      volatility: 5,
    },
  ]) {
    const v = bsm({ ...standard, ...p });
    for (const value of Object.values(v))
      if (typeof value === "number") assert.ok(Number.isFinite(value));
    assert.ok(v.call >= 0 && v.put >= 0);
  }
});
test("implied volatility recovers 48 call/put inputs within identifiable price precision", () => {
  for (const type of ["call", "put"])
    for (const strike of [80, 100, 120])
      for (const years of [0.5, 2])
        for (const volatility of [0.1, 0.2, 0.6, 1.5]) {
          const input = { ...standard, strike, years, volatility },
            price = bsm(input)[type],
            iv = impliedVolatility(input, price, type);
          near(iv.volatility, volatility, 2e-5);
          assert.ok(iv.iterations <= 160);
          near(bsm({ ...input, volatility: iv.volatility })[type], price, 2e-6);
        }
});
test("IV rejects arbitrage bounds, expiry, unsupported quotes; exact lower bound returns zero", () => {
  assert.throws(() => impliedVolatility({ ...standard, years: 0 }, 2));
  assert.throws(() => impliedVolatility(standard, -1));
  assert.throws(() => impliedVolatility(standard, 100));
  assert.throws(() => impliedVolatility(standard, 0));
  assert.equal(
    impliedVolatility(standard, 100 - 100 * Math.exp(-0.05)).volatility,
    0,
  );
  assert.throws(() => impliedVolatility(standard, 99.9));
});
test("CAGR uses explicit decimal rates and validates zero/negative endpoints and durations", () => {
  near(cagr(100, 121, 2), 0.1, 1e-12);
  near(cagr(100, 50, 1), -0.5, 1e-12);
  assert.equal(cagr(100, 0, 1), -1);
  for (const args of [
    [0, 1, 1],
    [-1, 1, 1],
    [1, -1, 1],
    [1, 2, 0],
    [1, 2, NaN],
  ])
    assert.throws(() => cagr(...args));
});
test("ACT/365 XIRR matches a standard irregular-flow benchmark and exact one-year return", () => {
  const flows = [
    { date: "2008-01-01", amount: -10000 },
    { date: "2008-03-01", amount: 2750 },
    { date: "2008-10-30", amount: 4250 },
    { date: "2009-02-15", amount: 3250 },
    { date: "2009-04-01", amount: 2750 },
  ];
  near(xirr(flows).rate, 0.373362535, 1e-8);
  const simple = xirr([
    { date: "2025-01-01", amount: -100 },
    { date: "2026-01-01", amount: 110 },
  ]);
  near(simple.rate, 0.1, 1e-10);
  near(simple.residual, 0, 1e-8);
  const sameDate = xirr([
    { date: "2025-01-01", amount: -50 },
    { date: "2025-01-01", amount: -50 },
    { date: "2026-01-01", amount: 110 },
  ]);
  near(sameDate.rate, 0.1, 1e-10);
  near(
    xirr([
      { date: "2025-01-01", amount: -100 },
      { date: "2026-01-01", amount: 50 },
    ]).rate,
    -0.5,
    1e-10,
  );
  near(
    xirr([
      { date: "2025-01-01", amount: -100 },
      { date: "2026-01-01", amount: 100 },
    ]).rate,
    0,
    1e-10,
  );
});
test("XIRR rejects invalid dates, all-one-sign, same-day-only and multiple-root scenarios", () => {
  for (const flows of [
    [
      { date: "2026-02-30", amount: -1 },
      { date: "2027-01-01", amount: 2 },
    ],
    [
      { date: "2026-01-01", amount: 1 },
      { date: "2027-01-01", amount: 2 },
    ],
    [
      { date: "2026-01-01", amount: -1 },
      { date: "2026-01-01", amount: 2 },
    ],
  ])
    assert.throws(() => xirr(flows));
  assert.throws(
    () =>
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2026-01-01", amount: 230 },
        { date: "2027-01-01", amount: -132 },
      ]),
    /Multiple XIRR roots/,
  );
});
test("historical investment refuses unsourced or unadjusted SBI-style requests", () => {
  const base = {
    amount: 100,
    start: "2025-01-01",
    end: "2026-01-01",
    prices: [],
    source: "",
    currency: "INR",
    adjustment: "SPLITS_ONLY",
    corporateActionsVerified: false,
    delistingChecked: false,
    rightsConfirmed: false,
  };
  assert.throws(() => historicalInvestment(base), /must be verified/);
  const input = {
    ...base,
    source: "Explicit adjusted test series",
    corporateActionsVerified: true,
    delistingChecked: true,
    rightsConfirmed: true,
    prices: [
      {
        date: "2025-01-01",
        adjustedClose: 50,
        knownAt: "2025-01-01T12:00:00Z",
      },
      {
        date: "2026-01-01",
        adjustedClose: 75,
        knownAt: "2026-01-01T12:00:00Z",
      },
    ],
  };
  const v = historicalInvestment(input);
  assert.equal(v.value, 150);
  assert.equal(v.returnPct, 50);
  assert.ok(v.scenario.includes("dividends excluded"));
  assert.ok(v.limitations[0].includes("Retrospective"));
  assert.throws(
    () => historicalInvestment({ ...input, start: "2000-01-01" }),
    /boundaries/,
  );
  assert.throws(() => historicalInvestment({ ...input, end: "2025-01-01" }));
  assert.throws(
    () =>
      historicalInvestment({
        ...input,
        prices: [input.prices[0], input.prices[0]],
      }),
    /Duplicate/,
  );
});
