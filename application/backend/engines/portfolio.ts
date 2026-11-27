/**
 * Manual ledger accounting only. Cost never implies a current market valuation.
 * Uses exact fixed-point decimal (BigInt scale 10^8) for holdings and cash/cost basis
 * so fractional quantities (e.g. buy 0.3, sell 0.1, sell 0.2) close to exact zero,
 * and validates transaction dates against the Asia/Kolkata (IST) business calendar date.
 */
export type Transaction = {
  kind: "BUY" | "SELL" | "DIVIDEND" | "DEPOSIT" | "WITHDRAWAL";
  symbol: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  date: string;
};

export const CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "AUD",
  "CAD",
  "SGD",
  "HKD",
];

/** Fixed-point decimal scale: 12 fractional digits (1e12) for exact fractional closure and 1e-10+ average cost precision. */
export const PORTFOLIO_DECIMAL_PLACES = 12;
const ZERO = BigInt(0);
const TWO = BigInt(2);
const TEN = BigInt(10);
const SCALE_BIGINT = BigInt("1000000000000");
const SCALE_NUMBER = 1e12;

function pow10BigInt(exp: number): bigint {
  let out = BigInt(1);
  for (let i = 0; i < exp; i++) out *= TEN;
  return out;
}

const IST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the YYYY-MM-DD business date in Asia/Kolkata (IST) for any instant.
 * If passed a plain date string (YYYY-MM-DD), preserves that date as-is.
 */
export function istCalendarDate(now: string | number | Date = Date.now()): string {
  if (typeof now === "string" && /^\d{4}-\d{2}-\d{2}$/.test(now)) {
    return now;
  }
  const ms =
    now instanceof Date
      ? now.getTime()
      : typeof now === "number"
        ? now
        : Date.parse(now);
  if (!Number.isFinite(ms)) {
    return IST_DATE_FMT.format(new Date());
  }
  return IST_DATE_FMT.format(new Date(ms));
}

/**
 * Parses a finite JS number into an exact scaled BigInt (scale 10^8) without
 * binary floating-point multiplication drift (e.g. 0.3 -> 30000000).
 * Uses half-away-from-zero rounding at the 9th decimal digit.
 */
export function toScaledDecimal(value: number): bigint {
  if (!Number.isFinite(value)) {
    throw new Error("Numeric value must be finite.");
  }
  if (value === 0) return ZERO;
  const negative = value < 0;
  const absStr = Math.abs(value).toString();
  let digits: string;
  let exponent = 0;
  const eIdx = absStr.search(/[eE]/);
  if (eIdx !== -1) {
    digits = absStr.slice(0, eIdx);
    exponent = Number.parseInt(absStr.slice(eIdx + 1), 10);
  } else {
    digits = absStr;
  }
  const dotIdx = digits.indexOf(".");
  let rawDigits: string;
  let fracLen = 0;
  if (dotIdx !== -1) {
    rawDigits = digits.slice(0, dotIdx) + digits.slice(dotIdx + 1);
    fracLen = digits.length - dotIdx - 1;
  } else {
    rawDigits = digits;
  }
  const shift = PORTFOLIO_DECIMAL_PLACES + exponent - fracLen;
  let scaled: bigint;
  if (shift >= 0) {
    scaled = BigInt(rawDigits) * pow10BigInt(shift);
  } else {
    const divPow = pow10BigInt(-shift);
    const num = BigInt(rawDigits);
    const half = divPow / TWO;
    scaled = (num + half) / divPow;
  }
  return negative ? -scaled : scaled;
}

/** Multiplies two scaled BigInt values (each at scale 10^8) returning a scaled BigInt (half-away-from-zero). */
function mulScaled(a: bigint, b: bigint): bigint {
  const prod = a * b;
  const neg = prod < ZERO;
  const abs = neg ? -prod : prod;
  const rounded = (abs + SCALE_BIGINT / TWO) / SCALE_BIGINT;
  return neg ? -rounded : rounded;
}

/** Divides `num` by `den` with half-away-from-zero rounding for exact proportional basis. */
function divRoundBigInt(num: bigint, den: bigint): bigint {
  if (den === ZERO) return ZERO;
  const neg = (num < ZERO) !== (den < ZERO);
  const absNum = num < ZERO ? -num : num;
  const absDen = den < ZERO ? -den : den;
  const q = (absNum + absDen / TWO) / absDen;
  return neg ? -q : q;
}

/** Converts a scaled BigInt back to a clean JS number with up to 8 fractional digits. */
export function fromScaledDecimal(scaled: bigint): number {
  if (scaled === ZERO) return 0;
  const neg = scaled < ZERO;
  const abs = neg ? -scaled : scaled;
  const whole = abs / SCALE_BIGINT;
  const frac = abs % SCALE_BIGINT;
  if (frac === ZERO) {
    return Number(neg ? -whole : whole);
  }
  const fracStr = frac.toString().padStart(PORTFOLIO_DECIMAL_PLACES, "0").replace(/0+$/, "");
  const text = `${neg ? "-" : ""}${whole.toString()}.${fracStr}`;
  const out = Number(text);
  return Number.isFinite(out) ? out : Number(scaled) / SCALE_NUMBER;
}

export function validateTransaction(
  value: unknown,
  now = new Date().toISOString(),
): Transaction {
  const t = value as Transaction;
  const maxDateIst = istCalendarDate(now);
  if (
    !t ||
    !["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"].includes(t.kind) ||
    typeof t.symbol !== "string" ||
    t.symbol.length > 50 ||
    !/^[-A-Za-z0-9:._/&^ ]{0,50}$/.test(t.symbol) ||
    !CURRENCIES.includes(t.currency) ||
    ![t.quantity, t.price, t.fees].every(Number.isFinite) ||
    t.quantity < 0 ||
    t.quantity > 1e12 ||
    t.price < 0 ||
    t.price > 1e12 ||
    t.fees < 0 ||
    t.fees > 1e10 ||
    typeof t.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
    !Number.isFinite(Date.parse(t.date + "T00:00:00Z")) ||
    new Date(t.date + "T00:00:00Z").toISOString().slice(0, 10) !== t.date ||
    t.date > maxDateIst
  )
    throw new Error(
      "Enter a valid transaction, currency and non-future calendar date.",
    );
  const qtyScaled = toScaledDecimal(t.quantity);
  const priceScaled = toScaledDecimal(t.price);
  const feesScaled = toScaledDecimal(t.fees);
  if (
    ["BUY", "SELL"].includes(t.kind) &&
    (!t.symbol.trim() || qtyScaled <= ZERO || priceScaled <= ZERO)
  )
    throw new Error(
      "Trades need an instrument, positive quantity and positive unit price.",
    );
  if (!["BUY", "SELL"].includes(t.kind) && (qtyScaled !== ZERO || priceScaled <= ZERO))
    throw new Error(
      "For cash or dividends set quantity to zero and enter the cash amount as price.",
    );
  if (t.kind === "DIVIDEND" && !t.symbol.trim())
    throw new Error("Dividend instrument required.");
  const grossProceedsScaled =
    t.kind === "SELL"
      ? mulScaled(qtyScaled, priceScaled)
      : priceScaled;
  if (
    (t.kind === "SELL" || t.kind === "DIVIDEND") &&
    feesScaled > grossProceedsScaled
  )
    throw new Error("Fees exceed transaction proceeds.");
  return { ...t, symbol: t.symbol.trim().toUpperCase() };
}

export function summarizePortfolio(
  transactions: Transaction[],
  currency: string,
  now = new Date().toISOString(),
) {
  const positions = new Map<
    string,
    {
      symbol: string;
      quantity: bigint;
      basis: bigint;
      realized: bigint;
      dividends: bigint;
    }
  >();
  let cash = ZERO,
    contributions = ZERO,
    realized = ZERO,
    dividends = ZERO,
    previous = "";
  for (const raw of transactions) {
    const t = validateTransaction(raw, now);
    if (t.currency !== currency)
      throw new Error(
        "Portfolio transactions must share its base currency. FX conversion is not assumed.",
      );
    if (t.date < previous)
      throw new Error(
        "Transactions must be chronological. Backdated edits need a reviewed replay.",
      );
    previous = t.date;
    const p = positions.get(t.symbol) || {
      symbol: t.symbol,
      quantity: ZERO,
      basis: ZERO,
      realized: ZERO,
      dividends: ZERO,
    };
    const qty = toScaledDecimal(t.quantity);
    const price = toScaledDecimal(t.price);
    const fees = toScaledDecimal(t.fees);

    if (t.kind === "BUY") {
      const gross = mulScaled(qty, price);
      const totalCost = gross + fees;
      p.quantity += qty;
      p.basis += totalCost;
      cash -= totalCost;
      positions.set(t.symbol, p);
    }
    if (t.kind === "SELL") {
      if (qty > p.quantity)
        throw new Error(
          "Sell quantity exceeds recorded holdings. Short positions are not supported.",
        );
      const isFullClose = qty === p.quantity;
      const basisSold = isFullClose
        ? p.basis
        : p.quantity > ZERO
          ? divRoundBigInt(p.basis * qty, p.quantity)
          : ZERO;
      const netProceeds = mulScaled(qty, price) - fees;
      const profit = netProceeds - basisSold;
      p.quantity = isFullClose ? ZERO : p.quantity - qty;
      p.basis = isFullClose ? ZERO : p.basis > basisSold ? p.basis - basisSold : ZERO;
      p.realized += profit;
      realized += profit;
      cash += netProceeds;
      positions.set(t.symbol, p);
    }
    if (t.kind === "DIVIDEND") {
      const netDiv = price - fees;
      cash += netDiv;
      dividends += netDiv;
      p.dividends += netDiv;
      positions.set(t.symbol, p);
    }
    if (t.kind === "DEPOSIT") {
      cash += price - fees;
      contributions += price;
    }
    if (t.kind === "WITHDRAWAL") {
      cash -= price + fees;
      contributions -= price;
    }
  }
  const holdings = [...positions.values()].map((p) => {
    const avgCostScaled =
      p.quantity > ZERO ? divRoundBigInt(p.basis * SCALE_BIGINT, p.quantity) : ZERO;
    return {
      symbol: p.symbol,
      quantity: fromScaledDecimal(p.quantity),
      basis: fromScaledDecimal(p.basis),
      realized: fromScaledDecimal(p.realized),
      dividends: fromScaledDecimal(p.dividends),
      averageCost: fromScaledDecimal(avgCostScaled),
    };
  });
  const investedCostScaled = [...positions.values()].reduce(
    (s, p) => s + p.basis,
    ZERO,
  );
  const cashNum = fromScaledDecimal(cash);
  return {
    currency,
    holdings,
    cash: cashNum,
    contributions: fromScaledDecimal(contributions),
    realized: fromScaledDecimal(realized),
    dividends: fromScaledDecimal(dividends),
    investedCost: fromScaledDecimal(investedCostScaled),
    marketValue: null,
    unrealized: null,
    method:
      "Exact 8-decimal fixed-point moving average cost including trade fees; nominal same-currency ledger (Asia/Kolkata calendar date). No tax certification.",
    cashNotice:
      cash < ZERO
        ? "Cash movements may be incomplete; negative recorded cash is not a broker balance."
        : null,
  };
}
