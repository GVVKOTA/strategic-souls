/** Educational mathematics using user-entered assumptions. No market data is generated. */
export type OptionInput = {
  spot: number;
  strike: number;
  years: number;
  rate: number;
  dividendYield: number;
  volatility: number;
};
export type OptionResult = {
  call: number;
  put: number;
  callDelta: number;
  putDelta: number;
  gamma: number | null;
  vega: number;
  callTheta: number | null;
  putTheta: number | null;
  callRho: number;
  putRho: number;
  assumptions: string;
  greekUnits: { vega: string; theta: string; rho: string };
};
const SQRT2PI = Math.sqrt(2 * Math.PI);
const pdf = (x: number) => Math.exp((-x * x) / 2) / SQRT2PI;
/** Normal CDF, absolute approximation error below 8e-8 for finite x. */
function cdf(x: number): number {
  if (x <= -38) return 0;
  if (x >= 38) return 1;
  const a = Math.abs(x),
    v = 1 / (1 + 0.2316419 * a),
    p = pdf(a),
    tail =
      p *
      (0.31938153 * v -
        0.356563782 * v * v +
        1.781477937 * v ** 3 -
        1.821255978 * v ** 4 +
        1.330274429 * v ** 5);
  return x >= 0 ? 1 - tail : tail;
}
function validateOption(p: OptionInput): void {
  if (
    !p ||
    ![p.spot, p.strike, p.years, p.rate, p.dividendYield, p.volatility].every(
      Number.isFinite,
    ) ||
    p.spot <= 0 ||
    p.strike <= 0 ||
    p.spot > 1e15 ||
    p.strike > 1e15 ||
    p.years < 0 ||
    p.years > 100 ||
    p.volatility < 0 ||
    p.volatility > 5 ||
    Math.abs(p.rate) > 1 ||
    Math.abs(p.dividendYield) > 1
  )
    throw new Error(
      "Use positive spot/strike, 0–100 years, 0–500% annual volatility, and annual decimal rates between −1 and 1.",
    );
}
const ASSUMPTIONS =
  "European exercise; continuous dividend yield and compounding; constant annualized volatility/rates; no fees, taxes, early exercise or discrete dividend model. This is a theoretical value, not an executable quote.";
const GREEK_UNITS = {
  vega: "Price change per 1 percentage point annual volatility",
  theta: "Price change per calendar day (365-day convention)",
  rho: "Price change per 1 percentage point annual rate",
};

export function bsm(input: OptionInput): OptionResult;
export function bsm(
  spot: number,
  strike: number,
  years: number,
  rate: number,
  dividendYield: number,
  volatility: number,
): OptionResult;
export function bsm(
  first: OptionInput | number,
  strike?: number,
  years?: number,
  rate?: number,
  dividendYield?: number,
  volatility?: number,
): OptionResult {
  const p: OptionInput =
    typeof first === "number"
      ? {
          spot: first,
          strike: strike!,
          years: years!,
          rate: rate!,
          dividendYield: dividendYield!,
          volatility: volatility!,
        }
      : first;
  validateOption(p);
  const {
    spot: s,
    strike: k,
    years: t,
    rate: r,
    dividendYield: q,
    volatility: sigma,
  } = p;
  if (t === 0) {
    const midpoint = s === k ? 0.5 : s > k ? 1 : 0;
    return {
      call: Math.max(s - k, 0),
      put: Math.max(k - s, 0),
      callDelta: midpoint,
      putDelta: midpoint - 1,
      gamma: null,
      vega: 0,
      callTheta: null,
      putTheta: null,
      callRho: 0,
      putRho: 0,
      assumptions:
        ASSUMPTIONS +
        " At expiry gamma/theta are undefined; at-the-money delta uses a stated midpoint convention.",
      greekUnits: GREEK_UNITS,
    };
  }
  const dq = Math.exp(-q * t),
    dr = Math.exp(-r * t),
    a = s * dq,
    b = k * dr;
  if (sigma === 0) {
    const active = a === b ? 0.5 : a > b ? 1 : 0,
      kink = a === b;
    return {
      call: Math.max(a - b, 0),
      put: Math.max(b - a, 0),
      callDelta: dq * active,
      putDelta: dq * (active - 1),
      gamma: kink ? null : 0,
      vega: kink ? (a * Math.sqrt(t)) / SQRT2PI / 100 : 0,
      callTheta: kink ? null : (active * (q * a - r * b)) / 365,
      putTheta: kink ? null : ((1 - active) * (r * b - q * a)) / 365,
      callRho: (active * k * t * dr) / 100,
      putRho: (-(1 - active) * k * t * dr) / 100,
      assumptions:
        ASSUMPTIONS +
        " Zero-volatility discounted payoff limit; gamma/theta are undefined at the payoff kink; vega uses the right-hand volatility derivative.",
      greekUnits: GREEK_UNITS,
    };
  }
  const root = Math.sqrt(t),
    d1 =
      (Math.log(s) - Math.log(k) + (r - q + 0.5 * sigma * sigma) * t) /
      (sigma * root),
    d2 = d1 - sigma * root,
    n1 = cdf(d1),
    n2 = cdf(d2),
    density = pdf(d1);
  // Calculate the out-of-the-money option directly, then recover the other by parity.
  // This avoids subtracting large, almost equal quantities in deep tails.
  const forwardDifference = a - b;
  let call: number, put: number;
  if (forwardDifference >= 0) {
    put = Math.max(0, b * cdf(-d2) - a * cdf(-d1));
    call = put + forwardDifference;
  } else {
    call = Math.max(0, a * n1 - b * n2);
    put = call - forwardDifference;
  }
  return {
    call,
    put,
    callDelta: dq * n1,
    putDelta: dq * (n1 - 1),
    gamma: (dq * density) / (s * sigma * root),
    vega: (a * density * root) / 100,
    callTheta:
      ((-a * density * sigma) / (2 * root) - r * b * n2 + q * a * n1) / 365,
    putTheta:
      ((-a * density * sigma) / (2 * root) +
        r * b * cdf(-d2) -
        q * a * cdf(-d1)) /
      365,
    callRho: (k * t * dr * n2) / 100,
    putRho: (-k * t * dr * cdf(-d2)) / 100,
    assumptions: ASSUMPTIONS,
    greekUnits: GREEK_UNITS,
  };
}

/** A finite bounded bisection solver; impossible quotes and unidentifiable expiry are errors. */
export function impliedVolatility(
  input: Omit<OptionInput, "volatility">,
  marketPrice: number,
  type: "call" | "put" = "call",
): { volatility: number; iterations: number; residual: number } {
  if (type !== "call" && type !== "put") throw new Error("Choose call or put.");
  validateOption({ ...input, volatility: 0 });
  if (input.years <= 0)
    throw new Error("Implied volatility is not identifiable at expiry.");
  if (!Number.isFinite(marketPrice) || marketPrice < 0)
    throw new Error("Market option price must be non-negative.");
  const a = input.spot * Math.exp(-input.dividendYield * input.years),
    b = input.strike * Math.exp(-input.rate * input.years),
    lower = Math.max(type === "call" ? a - b : b - a, 0),
    upper = type === "call" ? a : b,
    tolerance = Math.max(1e-10, Math.max(a, b) * 1e-10);
  if (marketPrice < lower - tolerance || marketPrice >= upper)
    throw new Error(
      "Option price violates finite-volatility no-arbitrage bounds.",
    );
  if (Math.abs(marketPrice - lower) <= tolerance)
    return { volatility: 0, iterations: 0, residual: lower - marketPrice };
  let lo = 0,
    hi = 5;
  const upperModel = bsm({ ...input, volatility: hi })[type];
  if (upperModel < marketPrice - tolerance)
    throw new Error(
      "Implied volatility exceeds the supported 500% annual bound.",
    );
  let residual = Infinity,
    mid = 0,
    iterations = 0;
  for (; iterations < 160; iterations++) {
    mid = (lo + hi) / 2;
    const price = bsm({ ...input, volatility: mid })[type];
    residual = price - marketPrice;
    if (Math.abs(residual) <= tolerance)
      return { volatility: mid, iterations: iterations + 1, residual };
    if (residual > 0) hi = mid;
    else lo = mid;
  }
  throw new Error(
    "Implied volatility did not converge within the numerical budget.",
  );
}

/** Decimal annual growth, e.g. 0.1 means 10%. A zero beginning value has no CAGR. */
export function cagr(begin: number, end: number, years: number): number {
  if (
    ![begin, end, years].every(Number.isFinite) ||
    begin <= 0 ||
    end < 0 ||
    years <= 0 ||
    years > 1000
  )
    throw new Error(
      "CAGR requires a positive beginning value and duration and a non-negative ending value.",
    );
  const value =
    end === 0 ? -1 : Math.expm1((Math.log(end) - Math.log(begin)) / years);
  if (!Number.isFinite(value))
    throw new Error("CAGR exceeds the supported numeric range.");
  return value;
}
export type CashFlow = { date: string; amount: number };
export type XirrResult = {
  rate: number;
  iterations: number;
  residual: number;
  method: "bracketed log-rate bisection";
  warning: string | null;
};
function calendarDate(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Use actual calendar dates in YYYY-MM-DD format.");
  const ms = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
    throw new Error("Invalid calendar date.");
  return ms;
}

/** ACT/365 XIRR. Multiple sign-changing roots are rejected instead of selecting an attractive answer. */
export function xirr(flows: CashFlow[], _guess = 0.1): XirrResult {
  if (
    !Array.isArray(flows) ||
    flows.length < 2 ||
    flows.length > 500 ||
    !Number.isFinite(_guess) ||
    _guess <= -1
  )
    throw new Error(
      "Use 2–500 dated cash flows and a finite guess above −100%.",
    );
  const grouped = new Map<number, number>();
  for (const flow of flows) {
    if (!flow || !Number.isFinite(flow.amount) || Math.abs(flow.amount) > 1e15)
      throw new Error("Cash-flow amounts must be finite and within ±1e15.");
    const at = calendarDate(flow.date);
    grouped.set(at, (grouped.get(at) ?? 0) + flow.amount);
  }
  const entries = [...grouped]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v !== 0);
  if (
    entries.length < 2 ||
    !entries.some(([, v]) => v > 0) ||
    !entries.some(([, v]) => v < 0)
  )
    throw new Error(
      "XIRR needs positive and negative cash flows on distinct dates.",
    );
  const first = entries[0][0],
    scale = entries.reduce((s, [, v]) => s + Math.abs(v), 0),
    points = entries.map(([at, amount]) => ({
      years: (at - first) / (365 * 86400000),
      amount: amount / scale,
    }));
  if (points[points.length - 1].years > 1000)
    throw new Error("Cash-flow duration exceeds 1,000 years.");
  const npv = (y: number): number => {
    const largest = Math.max(0, -points[points.length - 1].years * y);
    let sum = 0;
    for (const p of points) sum += p.amount * Math.exp(-p.years * y - largest);
    return sum;
  };
  const brackets: [number, number][] = [],
    exact: number[] = [];
  let before = -20,
    previous = npv(before);
  for (let j = 1; j <= 800; j++) {
    const current = -20 + j * 0.05,
      value = npv(current);
    if (Math.abs(value) < 1e-13) exact.push(current);
    else if (previous !== 0 && Math.sign(value) !== Math.sign(previous))
      brackets.push([before, current]);
    before = current;
    previous = value;
  }
  // Grid boundary roots can border two intervals; collapse numerically identical candidates.
  const candidates: [number, number][] = [
    ...brackets,
    ...exact.map((y) => [y, y] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);
  const unique: [number, number][] = [];
  for (const c of candidates)
    if (!unique.length || c[0] - unique[unique.length - 1][1] > 1e-8)
      unique.push(c);
  if (!unique.length)
    throw new Error(
      "No unique finite XIRR root was bracketed in the supported rate range.",
    );
  if (unique.length > 1)
    throw new Error(
      "Multiple XIRR roots exist; one annual return would be misleading. Use dated NPV scenarios.",
    );
  let [lo, hi] = unique[0],
    mid = (lo + hi) / 2,
    iterations = 0;
  for (; iterations < 200 && hi - lo > 1e-13; iterations++) {
    mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-13) break;
    if (Math.sign(f) === Math.sign(npv(lo))) lo = mid;
    else hi = mid;
  }
  const result = Math.expm1(mid);
  if (!Number.isFinite(result) || result <= -1)
    throw new Error("XIRR is outside the representable rate range.");
  const signs = entries
    .slice(1)
    .reduce(
      (s, [, v], i) => s + (Math.sign(v) !== Math.sign(entries[i][1]) ? 1 : 0),
      0,
    );
  const residual =
    npv(mid) *
    scale *
    Math.exp(Math.max(0, -points[points.length - 1].years * mid));
  if (!Number.isFinite(residual))
    throw new Error("XIRR residual cannot be represented reliably.");
  return {
    rate: result,
    iterations,
    residual,
    method: "bracketed log-rate bisection",
    warning:
      signs > 1
        ? "Cash flows change sign more than once. Only one bracketed root was found; uniqueness is not mathematically guaranteed."
        : null,
  };
}

export type AdjustedPrice = {
  date: string;
  adjustedClose: number;
  knownAt: string;
};
export type HistoricalInvestmentInput = {
  amount: number;
  start: string;
  end: string;
  prices: AdjustedPrice[];
  source: string;
  currency: string;
  adjustment: "SPLITS_AND_DIVIDENDS" | "SPLITS_ONLY";
  corporateActionsVerified: boolean;
  delistingChecked: boolean;
  rightsConfirmed: boolean;
};
/** Refuses unsupported history instead of fabricating the SBI/year-2000 example. */
export function historicalInvestment(input: HistoricalInvestmentInput): {
  value: number;
  returnPct: number;
  units: number;
  startDate: string;
  endDate: string;
  source: string;
  currency: string;
  scenario: string;
  limitations: string[];
} {
  if (
    !input ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 1e15
  )
    throw new Error("Investment amount must be positive and finite.");
  const start = calendarDate(input.start),
    end = calendarDate(input.end);
  if (end <= start) throw new Error("End date must be after start date.");
  if (
    input.rightsConfirmed !== true ||
    input.corporateActionsVerified !== true ||
    input.delistingChecked !== true ||
    !input.source?.trim() ||
    !["SPLITS_AND_DIVIDENDS", "SPLITS_ONLY"].includes(input.adjustment)
  )
    throw new Error(
      "Historical source, analysis rights, corporate actions and delisting coverage must be verified.",
    );
  if (
    !Array.isArray(input.prices) ||
    !input.prices.length ||
    input.prices.length > 100000
  )
    throw new Error("A bounded verified adjusted-price history is required.");
  const prices = input.prices
    .map((p) => {
      const date = calendarDate(p.date),
        known = Date.parse(p.knownAt);
      if (
        !Number.isFinite(p.adjustedClose) ||
        p.adjustedClose <= 0 ||
        !Number.isFinite(known) ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(p.knownAt) ||
        known < date
      )
        throw new Error(
          "Adjusted prices need positive values and valid source availability timestamps.",
        );
      return { ...p, at: date, known };
    })
    .sort((a, b) => a.at - b.at);
  if (prices.some((p, i) => i > 0 && p.at === prices[i - 1].at))
    throw new Error("Duplicate historical observation dates.");
  // A requested non-trading day uses the first observed session on or after it.
  // The explicit dates are returned; absence at either boundary is never extrapolated.
  const from = prices.find((p) => p.at >= start),
    to = [...prices].reverse().find((p) => p.at <= end);
  if (
    !from ||
    !to ||
    from.at >= to.at ||
    from.at - start > 7 * 86400000 ||
    end - to.at > 7 * 86400000
  )
    throw new Error(
      "Verified history does not cover the requested boundaries without a material gap.",
    );
  const units = input.amount / from.adjustedClose,
    value = input.amount * (to.adjustedClose / from.adjustedClose);
  if (!Number.isFinite(value))
    throw new Error("Historical calculation exceeds the numeric range.");
  return {
    value,
    returnPct: (value / input.amount - 1) * 100,
    units,
    startDate: from.date,
    endDate: to.date,
    source: input.source,
    currency: input.currency,
    scenario:
      input.adjustment === "SPLITS_AND_DIVIDENDS"
        ? "Nominal total-return adjusted series"
        : "Nominal split-adjusted price return; dividends excluded",
    limitations: [
      "Retrospective adjusted-series scenario, not point-in-time trading simulation.",
      "Fractional units assumed; fees, taxes, inflation and currency conversion excluded.",
      "Adjusted-series units are mathematical units, not a reconstructed legal share register.",
    ],
  };
}

export type ManualHistoricalInvestmentInput = {
  amount: number;
  buyPrice: number;
  sellPrice: number;
  buyDate: string;
  sellDate: string;
  fees?: number;
};

export type ManualHistoricalInvestmentResult = {
  units: number;
  grossValue: number;
  netValue: number;
  netProfit: number;
  netReturnPct: number;
  annualizedCagrPct: number | null;
  holdingDays: number;
  holdingYears: number;
  fees: number;
  limitations: string[];
};

/**
 * Deterministic manual historical-investment calculator from user-entered buy/sell prices & fees.
 * Explicitly does NOT assume stock splits, bonus issues, dividends, or taxes.
 */
export function manualHistoricalInvestment(
  input: ManualHistoricalInvestmentInput,
): ManualHistoricalInvestmentResult {
  const fees = input.fees ?? 0;
  if (
    !input ||
    ![input.amount, input.buyPrice, input.sellPrice, fees].every(Number.isFinite) ||
    input.amount <= 0 ||
    input.buyPrice <= 0 ||
    input.sellPrice < 0 ||
    fees < 0 ||
    input.amount > 1e15 ||
    input.buyPrice > 1e15 ||
    input.sellPrice > 1e15
  ) {
    throw new Error(
      "Enter positive investment amount and buy price, non-negative sell price, and non-negative fees.",
    );
  }
  const startMs = calendarDate(input.buyDate);
  const endMs = calendarDate(input.sellDate);
  if (endMs <= startMs) {
    throw new Error("Sell date must be after buy date.");
  }
  const holdingDays = (endMs - startMs) / 86_400_000;
  const holdingYears = holdingDays / 365;
  const units = input.amount / input.buyPrice;
  const grossValue = units * input.sellPrice;
  const netValue = grossValue - fees;
  const netProfit = netValue - input.amount;
  const netReturnPct = (netProfit / input.amount) * 100;
  const annualizedCagrPct =
    netValue > 0 && holdingYears > 0 && holdingYears <= 1000
      ? cagr(input.amount, netValue, holdingYears) * 100
      : null;

  return {
    units,
    grossValue,
    netValue,
    netProfit,
    netReturnPct,
    annualizedCagrPct,
    holdingDays,
    holdingYears,
    fees,
    limitations: [
      "Calculated strictly from user-entered buy/sell prices and explicit fees.",
      "Stock splits, dividends, bonus shares, taxes, and inflation are NOT assumed or inferred.",
      "Automatic corporate-action total-return lookup remains unavailable until a licensed historical equity feed is connected.",
    ],
  };
}
