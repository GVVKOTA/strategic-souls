/** Manual ledger accounting only. Cost never implies a current market valuation. */
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
export function validateTransaction(
  value: unknown,
  now = new Date().toISOString(),
): Transaction {
  const t = value as Transaction;
  if (
    !t ||
    !["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"].includes(t.kind) ||
    typeof t.symbol !== "string" ||
    t.symbol.length > 50 ||
    !/^[-A-Za-z0-9:._/ ]{0,50}$/.test(t.symbol) ||
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
    t.date > now.slice(0, 10)
  )
    throw new Error(
      "Enter a valid transaction, currency and non-future calendar date.",
    );
  if (
    ["BUY", "SELL"].includes(t.kind) &&
    (!t.symbol.trim() || t.quantity <= 0 || t.price <= 0)
  )
    throw new Error(
      "Trades need an instrument, positive quantity and positive unit price.",
    );
  if (!["BUY", "SELL"].includes(t.kind) && (t.quantity !== 0 || t.price <= 0))
    throw new Error(
      "For cash or dividends set quantity to zero and enter the cash amount as price.",
    );
  if (t.kind === "DIVIDEND" && !t.symbol.trim())
    throw new Error("Dividend instrument required.");
  if (
    (t.kind === "SELL" || t.kind === "DIVIDEND") &&
    t.fees > t.price * (t.quantity || 1)
  )
    throw new Error("Fees exceed transaction proceeds.");
  return { ...t, symbol: t.symbol.trim().toUpperCase() };
}
export function summarizePortfolio(
  transactions: Transaction[],
  currency: string,
) {
  const positions = new Map<
    string,
    {
      symbol: string;
      quantity: number;
      basis: number;
      realized: number;
      dividends: number;
    }
  >();
  let cash = 0,
    contributions = 0,
    realized = 0,
    dividends = 0,
    previous = "";
  for (const raw of transactions) {
    const t = validateTransaction(raw);
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
      quantity: 0,
      basis: 0,
      realized: 0,
      dividends: 0,
    };
    if (t.kind === "BUY") {
      p.quantity += t.quantity;
      p.basis += t.quantity * t.price + t.fees;
      cash -= t.quantity * t.price + t.fees;
      positions.set(t.symbol, p);
    }
    if (t.kind === "SELL") {
      if (t.quantity > p.quantity)
        throw new Error(
          "Sell quantity exceeds recorded holdings. Short positions are not supported.",
        );
      const basis = p.quantity ? (p.basis * t.quantity) / p.quantity : 0,
        profit = t.quantity * t.price - t.fees - basis;
      p.quantity -= t.quantity;
      p.basis = Math.max(0, p.basis - basis);
      p.realized += profit;
      realized += profit;
      cash += t.quantity * t.price - t.fees;
      positions.set(t.symbol, p);
    }
    if (t.kind === "DIVIDEND") {
      cash += t.price - t.fees;
      dividends += t.price - t.fees;
      p.dividends += t.price - t.fees;
      positions.set(t.symbol, p);
    }
    if (t.kind === "DEPOSIT") {
      cash += t.price - t.fees;
      contributions += t.price;
    }
    if (t.kind === "WITHDRAWAL") {
      cash -= t.price + t.fees;
      contributions -= t.price;
    }
  }
  const holdings = [...positions.values()].map((p) => ({
    ...p,
    averageCost: p.quantity ? p.basis / p.quantity : 0,
  }));
  return {
    currency,
    holdings,
    cash,
    contributions,
    realized,
    dividends,
    investedCost: holdings.reduce((s, p) => s + p.basis, 0),
    marketValue: null,
    unrealized: null,
    method:
      "Moving average cost including trade fees; nominal same-currency ledger. No tax certification.",
    cashNotice:
      cash < 0
        ? "Cash movements may be incomplete; negative recorded cash is not a broker balance."
        : null,
  };
}
