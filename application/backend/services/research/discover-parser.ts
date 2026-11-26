/**
 * Strategic Souls X5.1 — Deterministic Natural-Language Research Parser (Advanced Discover).
 * Translates structured English technical research intent into the SINGLE canonical AST
 * (backend/engines/scan.ts) with explicit assumptions, parsed clauses, and honest unsupported-phrase errors.
 * Never executes arbitrary generated code or fabricates unparsed intent.
 */
import { compileFormula, type CanonicalRule } from "../../engines/scan";

export type DiscoverClause = {
  matchedText: string;
  formula: string;
  explanation: string;
  assumptions: string[];
};

export type DiscoverBlueprint = {
  parserVersion: "x51-discover-deterministic-1";
  originalQuery: string;
  supported: boolean;
  formula: string | null;
  canonicalRule: CanonicalRule | null;
  clauses: DiscoverClause[];
  assumptions: string[];
  unsupportedPhrases: string[];
  interpretationConfidence: "HIGH" | "MEDIUM" | "UNSUPPORTED";
  suggestedTimeframe: "30m" | "1h" | "1d" | "1wk" | "1mo";
  suggestedHorizon: number;
  humanSummary: string;
};

export const DISCOVER_EXAMPLES: readonly {
  title: string;
  query: string;
}[] = Object.freeze([
  {
    title: "Consolidation + Resistance Breakout + Volume + Uptrend",
    query:
      "Find stocks trading sideways for 15 closed candles, breaking resistance on more than 1.5x volume while the daily trend is rising",
  },
  {
    title: "RSI Pullback Above SMA(20)",
    query: "RSI below 40 and close above SMA 20",
  },
  {
    title: "EMA(9)/EMA(21) Bullish Cross + Volume Surge",
    query: "EMA 9 crosses above EMA 21 on 2x volume",
  },
  {
    title: "MACD Momentum + Strong ADX Trend",
    query: "MACD above signal and ADX above 25",
  },
  {
    title: "Bollinger Squeeze + Positive Momentum",
    query: "Bollinger squeeze with RSI above 50",
  },
  {
    title: "20-Bar High Breakout",
    query: "Close breaks 20-bar high with volume above 1.5x average",
  },
]);

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function detectTimeframe(q: string): "30m" | "1h" | "1d" | "1wk" | "1mo" {
  if (/\b(30\s*m|30\s*min|30\s*minute)\b/i.test(q)) return "30m";
  if (/\b(1\s*h|hourly|60\s*min)\b/i.test(q)) return "1h";
  if (/\b(weekly|1\s*w|1\s*wk)\b/i.test(q)) return "1wk";
  if (/\b(monthly|1\s*mo)\b/i.test(q)) return "1mo";
  return "1d";
}

function detectHorizon(q: string): number {
  const m = /\b(?:next|over|horizon(?:\s+of)?)\s+(\d{1,3})\s*(?:bars?|candles?|days?|sessions?)\b/i.exec(
    q,
  );
  if (m) return clampInt(Number(m[1]), 1, 250);
  return 10;
}

/**
 * Splits a natural-language research prompt into clauses and translates each recognized
 * technical condition into canonical AST fragments while flagging unrecognized phrases.
 */
export function parseDiscoverQuery(rawQuery: string): DiscoverBlueprint {
  const originalQuery = String(rawQuery ?? "").trim();
  const suggestedTimeframe = detectTimeframe(originalQuery);
  const suggestedHorizon = detectHorizon(originalQuery);

  if (!originalQuery || originalQuery.length < 4) {
    return {
      parserVersion: "x51-discover-deterministic-1",
      originalQuery,
      supported: false,
      formula: null,
      canonicalRule: null,
      clauses: [],
      assumptions: [],
      unsupportedPhrases: ["Enter a research description to parse into rules."],
      interpretationConfidence: "UNSUPPORTED",
      suggestedTimeframe,
      suggestedHorizon,
      humanSummary: "No research query provided yet.",
    };
  }

  // Strip benign leading prompt boilerplate so remaining unmatched text is flagged honestly
  const stripped = originalQuery
    .replace(
      /^(?:find|scan(?:\s+for)?|show(?:\s+me)?|search(?:\s+for)?|list|get)\s+(?:all\s+)?(?:stocks?|equities|assets?|instruments?|pairs?)?\s*(?:that\s+are|which\s+are|where|with)?\s*/i,
      "",
    )
    .trim();

  // Split on logical connectors while keeping clauses readable
  const segments = stripped
    .split(/\s*(?:,|;|\band\b|\bwhile\b|\bwith\b|\bthen\b|\bon\b(?=\s+(?:more\s+than\s+)?\d+(?:\.\d+)?\s*x?\s*vol))\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const clauses: DiscoverClause[] = [];
  const unsupportedPhrases: string[] = [];
  let sidewaysBars: number | null = null;

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    // Ignore pure horizon/timeframe metadata clauses that were already captured
    if (
      /^(?:on|using|for|over|in)?\s*(?:the\s+)?(?:daily|weekly|monthly|hourly|30\s*min(?:ute)?)\s*(?:timeframe|chart|bars?|candles?)?$/i.test(
        s,
      ) ||
      /^(?:next|over|horizon(?:\s+of)?)\s+\d{1,3}\s*(?:bars?|candles?|days?|sessions?)$/i.test(
        s,
      )
    ) {
      continue;
    }

    let matched = false;

    // 1. Sideways / consolidating for N closed candles
    const sideMatch =
      /(?:trading\s+sideways|consolidat(?:ing|ed|ion)|range[\s-]*bound|flat)\s*(?:for\s+)?(\d{1,3})?\s*(?:closed\s+)?(?:bars?|candles?|days?|sessions?)?/i.exec(
        s,
      );
    if (sideMatch) {
      const n = clampInt(Number(sideMatch[1] || 15), 5, 100);
      sidewaysBars = n;
      clauses.push({
        matchedText: s,
        formula: `(lag(rollingmax(high, ${n}), 1) - lag(rollingmin(low, ${n}), 1)) / lag(sma(close, ${n}), 1) <= 0.12`,
        explanation: `Prior ${n} closed bars traded within a <=12% high-low consolidation range`,
        assumptions: [
          `Interpreted "${s}" as prior ${n}-bar high-low span <= 12% of ${n}-bar average close (excluding current bar).`,
        ],
      });
      matched = true;
    }

    // 2. Breaking resistance / N-bar high or low
    const breakHighMatch =
      /(?:break(?:ing|s|out)?(?:\s+above|\s+out\s+of)?)\s+(?:(?:the\s+)?(?:previous|prior|trailing)?\s*(\d{1,3})[\s-]*(?:bar|candle|day|session)s?\s+high|resistance)/i.exec(
        s,
      );
    if (!matched && breakHighMatch) {
      const n = clampInt(
        Number(breakHighMatch[1] || sidewaysBars || 20),
        2,
        200,
      );
      clauses.push({
        matchedText: s,
        formula: `close > lag(rollingmax(high, ${n}), 1)`,
        explanation: `Close breaks above the previous ${n}-bar high (excluding current bar)`,
        assumptions: breakHighMatch[1]
          ? []
          : [
              `Interpreted "breaking resistance" as close > prior ${n}-bar rolling high (excluding current bar).`,
            ],
      });
      matched = true;
    }

    const breakLowMatch =
      /(?:break(?:ing|s|down)?(?:\s+below)?)\s+(?:(?:the\s+)?(?:previous|prior|trailing)?\s*(\d{1,3})[\s-]*(?:bar|candle|day|session)s?\s+low|support)/i.exec(
        s,
      );
    if (!matched && breakLowMatch) {
      const n = clampInt(
        Number(breakLowMatch[1] || sidewaysBars || 20),
        2,
        200,
      );
      clauses.push({
        matchedText: s,
        formula: `close < lag(rollingmin(low, ${n}), 1)`,
        explanation: `Close breaks below the previous ${n}-bar low (excluding current bar)`,
        assumptions: breakLowMatch[1]
          ? []
          : [
              `Interpreted "breaking support" as close < prior ${n}-bar rolling low (excluding current bar).`,
            ],
      });
      matched = true;
    }

    // 3. Volume multiple (e.g. "more than 1.5x volume", "volume above 2x average")
    const volMatch =
      /(?:volume\s+(?:is\s+)?(?:above|greater\s+than|over|more\s+than|>)\s*(\d+(?:\.\d+)?)\s*x?|(?:more\s+than|above|over|>)?\s*(\d+(?:\.\d+)?)\s*x\s*(?:average\s+)?volume)/i.exec(
        s,
      );
    if (!matched && volMatch) {
      const mult = Math.max(0.5, Math.min(20, Number(volMatch[1] || volMatch[2])));
      clauses.push({
        matchedText: s,
        formula: `all(volume > 0, volume > lag(sma(volume, 20), 1) * ${mult})`,
        explanation: `Non-zero volume exceeds ${mult}x the prior 20-bar average volume`,
        assumptions: [
          `Volume baseline uses the trailing 20 closed bars excluding the current bar.`,
        ],
      });
      matched = true;
    }

    // 4. Daily/overall trend rising / falling
    if (
      !matched &&
      /(?:(?:daily|primary|overall|market)?\s*trend\s+is\s+(?:rising|up|bullish|positive)|in\s+an?\s+uptrend)/i.test(
        s,
      )
    ) {
      clauses.push({
        matchedText: s,
        formula: "close > ema(close, 50)",
        explanation: "Close is above EMA(50) (rising trend filter)",
        assumptions: [
          `Interpreted "${s}" as close > EMA(50) on the selected timeframe.`,
        ],
      });
      matched = true;
    }
    if (
      !matched &&
      /(?:(?:daily|primary|overall|market)?\s*trend\s+is\s+(?:falling|down|bearish|negative)|in\s+a\s+downtrend)/i.test(
        s,
      )
    ) {
      clauses.push({
        matchedText: s,
        formula: "close < ema(close, 50)",
        explanation: "Close is below EMA(50) (falling trend filter)",
        assumptions: [
          `Interpreted "${s}" as close < EMA(50) on the selected timeframe.`,
        ],
      });
      matched = true;
    }

    // 5. RSI crosses / thresholds / oversold / overbought
    const rsiCross =
      /rsi(?:\s*\(\s*(\d{1,3})\s*\))?\s*cross(?:es|ed)?\s*(above|below)\s*(\d+(?:\.\d+)?)/i.exec(
        s,
      );
    if (!matched && rsiCross) {
      const p = clampInt(Number(rsiCross[1] || 14), 2, 100);
      const dir =
        rsiCross[2].toLowerCase() === "above" ? "crossesAbove" : "crossesBelow";
      const val = Number(rsiCross[3]);
      clauses.push({
        matchedText: s,
        formula: `${dir}(rsi(close, ${p}), ${val})`,
        explanation: `RSI(${p}) ${rsiCross[2].toLowerCase() === "above" ? "crosses above" : "crosses below"} ${val}`,
        assumptions: [],
      });
      matched = true;
    }

    const rsiCmp =
      /rsi(?:\s*\(\s*(\d{1,3})\s*\))?\s*(?:is\s+)?(above|over|greater\s+than|>|>=|below|under|less\s+than|<|<=)\s*(\d+(?:\.\d+)?)/i.exec(
        s,
      );
    if (!matched && rsiCmp) {
      const p = clampInt(Number(rsiCmp[1] || 14), 2, 100);
      const rawOp = rsiCmp[2].toLowerCase();
      const op =
        rawOp === ">="
          ? ">="
          : rawOp === "<="
            ? "<="
            : rawOp.startsWith("a") || rawOp.startsWith("o") || rawOp.startsWith("g") || rawOp === ">"
              ? ">"
              : "<";
      const val = Number(rsiCmp[3]);
      clauses.push({
        matchedText: s,
        formula: `rsi(close, ${p}) ${op} ${val}`,
        explanation: `Wilder RSI(${p}) ${op} ${val}`,
        assumptions: [],
      });
      matched = true;
    }

    if (!matched && /\boversold\b/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "rsi(close, 14) < 30",
        explanation: "Wilder RSI(14) < 30 (oversold threshold)",
        assumptions: [`Interpreted "oversold" as RSI(14) < 30.`],
      });
      matched = true;
    }
    if (!matched && /\boverbought\b/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "rsi(close, 14) > 70",
        explanation: "Wilder RSI(14) > 70 (overbought threshold)",
        assumptions: [`Interpreted "overbought" as RSI(14) > 70.`],
      });
      matched = true;
    }

    // 6. MA crosses (e.g. "EMA 9 crosses above EMA 21", "SMA 20 crosses below SMA 50")
    const maCross =
      /(sma|ema)\s*\(?\s*(\d{1,3})\s*\)?\s*cross(?:es|ed)?\s*(above|below)\s*(sma|ema)\s*\(?\s*(\d{1,3})\s*\)?/i.exec(
        s,
      );
    if (!matched && maCross) {
      const fn1 = maCross[1].toLowerCase();
      const p1 = clampInt(Number(maCross[2]), 2, 250);
      const dir =
        maCross[3].toLowerCase() === "above" ? "crossesAbove" : "crossesBelow";
      const fn2 = maCross[4].toLowerCase();
      const p2 = clampInt(Number(maCross[5]), 2, 250);
      clauses.push({
        matchedText: s,
        formula: `${dir}(${fn1}(close, ${p1}), ${fn2}(close, ${p2}))`,
        explanation: `${fn1.toUpperCase()}(${p1}) ${maCross[3].toLowerCase() === "above" ? "crosses above" : "crosses below"} ${fn2.toUpperCase()}(${p2})`,
        assumptions: [],
      });
      matched = true;
    }

    // 7. Close above/below SMA/EMA
    const closeMa =
      /(?:close|price)\s*(?:is\s+)?(above|below|over|under|>|<)\s*(sma|ema)\s*\(?\s*(\d{1,3})\s*\)?/i.exec(
        s,
      );
    if (!matched && closeMa) {
      const op =
        /above|over|>/i.test(closeMa[1]) ? ">" : "<";
      const fn = closeMa[2].toLowerCase();
      const p = clampInt(Number(closeMa[3]), 2, 250);
      clauses.push({
        matchedText: s,
        formula: `close ${op} ${fn}(close, ${p})`,
        explanation: `Close ${op} ${fn.toUpperCase()}(${p})`,
        assumptions: [],
      });
      matched = true;
    }

    // 8. MACD conditions
    if (!matched && /macd\s+cross(?:es|ed)?\s+above\s+signal/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula:
          "crossesAbove(macd(close, 12, 26), macdsignal(close, 12, 26, 9))",
        explanation: "MACD(12,26) crosses above its 9-bar signal line",
        assumptions: [],
      });
      matched = true;
    }
    if (!matched && /macd\s+cross(?:es|ed)?\s+below\s+signal/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula:
          "crossesBelow(macd(close, 12, 26), macdsignal(close, 12, 26, 9))",
        explanation: "MACD(12,26) crosses below its 9-bar signal line",
        assumptions: [],
      });
      matched = true;
    }
    if (!matched && /macd\s+(?:is\s+)?above\s+signal/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "macd(close, 12, 26) > macdsignal(close, 12, 26, 9)",
        explanation: "MACD(12,26) is above its 9-bar signal line",
        assumptions: [],
      });
      matched = true;
    }
    if (!matched && /macd\s+(?:is\s+)?below\s+signal/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "macd(close, 12, 26) < macdsignal(close, 12, 26, 9)",
        explanation: "MACD(12,26) is below its 9-bar signal line",
        assumptions: [],
      });
      matched = true;
    }
    if (!matched && /macd\s+(?:histogram\s+)?(?:is\s+)?(?:above\s+(?:zero|0)|positive)/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "macdhist(close, 12, 26, 9) > 0",
        explanation: "MACD(12,26,9) histogram is above zero",
        assumptions: [],
      });
      matched = true;
    }

    // 9. ADX & Bollinger squeeze
    const adxCmp =
      /adx(?:\s*\(\s*(\d{1,3})\s*\))?\s*(?:is\s+)?(above|over|greater\s+than|>|below|under|less\s+than|<)\s*(\d+(?:\.\d+)?)/i.exec(
        s,
      );
    if (!matched && adxCmp) {
      const p = clampInt(Number(adxCmp[1] || 14), 2, 100);
      const op = /above|over|greater|>/i.test(adxCmp[2]) ? ">" : "<";
      const val = Number(adxCmp[3]);
      clauses.push({
        matchedText: s,
        formula: `adx(${p}) ${op} ${val}`,
        explanation: `Wilder ADX(${p}) ${op} ${val}`,
        assumptions: [],
      });
      matched = true;
    }

    if (!matched && /bollinger\s+(?:band\s+)?squeeze/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "bbwidth(close, 20, 2) <= rollingmin(bbwidth(close, 20, 2), 20)",
        explanation:
          "Bollinger(20,2) bandwidth is at its lowest level of the trailing 20 closed bars",
        assumptions: [
          `Interpreted "Bollinger squeeze" as 20-bar minimum of Bollinger(20,2) bandwidth.`,
        ],
      });
      matched = true;
    }

    if (!matched && /stochastic\s+(?:k\s+)?cross(?:es|ed)?\s+above\s+d/i.test(s)) {
      clauses.push({
        matchedText: s,
        formula: "crossesAbove(stochk(14, 3), stochd(14, 3, 3))",
        explanation: "Stochastic(14,3,3) %K crosses above %D",
        assumptions: [],
      });
      matched = true;
    }

    if (!matched) {
      unsupportedPhrases.push(s);
    }
  }

  if (clauses.length === 0) {
    return {
      parserVersion: "x51-discover-deterministic-1",
      originalQuery,
      supported: false,
      formula: null,
      canonicalRule: null,
      clauses: [],
      assumptions: [],
      unsupportedPhrases:
        unsupportedPhrases.length > 0 ? unsupportedPhrases : [originalQuery],
      interpretationConfidence: "UNSUPPORTED",
      suggestedTimeframe,
      suggestedHorizon,
      humanSummary:
        "Could not translate this query into deterministic scan rules. Try supported technical phrases (RSI, SMA/EMA, MACD, ADX, Bollinger squeeze, N-bar breakout, consolidation, volume multiple) or use Build mode.",
    };
  }

  const combinedFormula =
    clauses.length === 1
      ? clauses[0].formula
      : `all(${clauses.map((c) => c.formula).join(", ")})`;

  const canonicalRule = compileFormula(combinedFormula);
  const assumptions = clauses.flatMap((c) => c.assumptions);
  const confidence: DiscoverBlueprint["interpretationConfidence"] =
    unsupportedPhrases.length === 0 && assumptions.length <= 2
      ? "HIGH"
      : "MEDIUM";

  return {
    parserVersion: "x51-discover-deterministic-1",
    originalQuery,
    supported: true,
    formula: canonicalRule.formula,
    canonicalRule,
    clauses,
    assumptions,
    unsupportedPhrases,
    interpretationConfidence: confidence,
    suggestedTimeframe,
    suggestedHorizon,
    humanSummary: clauses.map((c) => c.explanation).join(" AND ") + ".",
  };
}
