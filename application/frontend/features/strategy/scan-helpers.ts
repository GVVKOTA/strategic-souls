import type { ScanUniversePreset } from "../../../backend/services/research/research";
import type { ScanRun } from "../../components/workspace/shared";

export type FormulaParamToken = {
  id: string;
  label: string;
  value: string;
  start: number;
  end: number;
};

export type ScanSortKey =
  | "move_desc"
  | "move_asc"
  | "vol_desc"
  | "rsi_asc"
  | "rsi_desc"
  | "range_desc"
  | "range_asc"
  | "symbol_asc";

export type ScanRowItem = ScanRun["payload"]["results"]["results"][number];

export const INDEX_INSTRUMENT_IDS = new Set([
  "NSE:NIFTY",
  "NSE:BANKNIFTY",
  "NSE:NIFTYMIDCAP100",
  "BSE:SENSEX",
]);

const UNIVERSE_LABELS: Record<ScanUniversePreset, string> = {
  MARKET: "Market",
  MY_WATCHLIST: "Watchlist",
  INDIAN_EQUITIES: "NSE / BSE Equities",
  NIFTY_500: "Nifty 500",
  MCX_FUTURES: "MCX Futures",
  ECB_DAILY: "ECB Reference FX",
  CUSTOM_CSV: "Private Daily CSV",
};

function formatIndianNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatIstMoment(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return (
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value)) + " IST"
  );
}

export function sourceBadgeLabel(rawPreset?: string, rawSource?: string): string {
  if (rawPreset === "MY_WATCHLIST" || rawSource === "Watchlist") return "Watchlist";
  if (rawPreset === "MARKET") return "Market";
  if (rawPreset && rawPreset in UNIVERSE_LABELS) {
    return UNIVERSE_LABELS[rawPreset as ScanUniversePreset];
  }
  if (rawSource && /private\s*owner|configured exchange feed/i.test(rawSource)) {
    return "Market";
  }
  return rawSource || "Market";
}

export function formatScanPrice(
  instrumentId: string,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (instrumentId.startsWith("ECB:")) {
    return value.toFixed(4);
  }
  if (INDEX_INSTRUMENT_IDS.has(instrumentId)) {
    return formatIndianNumber(value, 2);
  }
  if (/^(NSE|BSE|MCX):/.test(instrumentId)) {
    return `₹${formatIndianNumber(value, 2)}`;
  }
  return formatIndianNumber(value, 2);
}

export function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

export function rsiZoneBadge(rsi: number | null | undefined): {
  label: string;
  tone: "pos" | "neg" | "teal" | "muted";
} | null {
  if (rsi === null || rsi === undefined || !Number.isFinite(rsi)) return null;
  if (rsi < 30) return { label: "Oversold", tone: "pos" };
  if (rsi < 45) return { label: "Cool", tone: "muted" };
  if (rsi <= 65) return { label: "Balanced", tone: "teal" };
  if (rsi <= 75) return { label: "Strong", tone: "pos" };
  return { label: "Stretched", tone: "neg" };
}

export function sortScanRows(rows: readonly ScanRowItem[], sortBy: ScanSortKey): ScanRowItem[] {
  const numOr = (v: number | null | undefined, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return [...rows].sort((a, b) => {
    const ma = a.metrics;
    const mb = b.metrics;
    switch (sortBy) {
      case "move_desc":
        return numOr(mb?.changePct, -9999) - numOr(ma?.changePct, -9999);
      case "move_asc":
        return numOr(ma?.changePct, 9999) - numOr(mb?.changePct, 9999);
      case "vol_desc":
        return numOr(mb?.volRatio, -1) - numOr(ma?.volRatio, -1);
      case "rsi_asc":
        return numOr(ma?.rsi14, 999) - numOr(mb?.rsi14, 999);
      case "rsi_desc":
        return numOr(mb?.rsi14, -1) - numOr(ma?.rsi14, -1);
      case "range_desc":
        return numOr(mb?.rangePosPct, -1) - numOr(ma?.rangePosPct, -1);
      case "range_asc":
        return numOr(ma?.rangePosPct, 999) - numOr(mb?.rangePosPct, 999);
      case "symbol_asc":
      default:
        return a.instrumentId.localeCompare(b.instrumentId);
    }
  });
}

const SAFE_SIGNED_DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;

export function safeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : "";
  }
  const str = String(raw);
  if (str.length === 0) return "";
  // Preserve genuine finite numeric strings (including negative metrics like -2.5)
  // while neutralizing spreadsheet formula-injection prefixes (=, +, -, @, tab, CR).
  const isPureNumeric = SAFE_SIGNED_DECIMAL_RE.test(str);
  const neutralized =
    !isPureNumeric && /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function exportScanResultsCsv(scan: ScanRun): void {
  const rows = scan.payload.results?.results ?? [];
  const derivedOnly =
    scan.redaction?.applied === true ||
    !rows.some((r) => typeof r.metrics?.close === "number");
  if (derivedOnly) {
    const lines = [["Instrument", "Venue", "Status", "BarTimestamp", "Source"].join(",")];
    for (const r of rows) {
      const [venue, sym] = r.instrumentId.includes(":")
        ? r.instrumentId.split(":", 2)
        : ["MKT", r.instrumentId];
      lines.push([sym, venue, r.status, r.latestEventAt ?? "", r.source ?? ""].map(safeCsvCell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeName = (scan.name || "soul-scan").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48);
    link.download = `${safeName}-derived-results.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const header = [
    "Instrument",
    "Venue",
    "Status",
    "BarTimestamp",
    "Close",
    "ChangePct",
    "RSI14",
    "EMA20",
    "DistEMA20Pct",
    "SMA50",
    "VolRatio",
    "ATR14",
    "ATRPct",
    "Low20",
    "High20",
    "RangePosPct",
    "RuleProof",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const [venue, sym] = r.instrumentId.includes(":")
      ? r.instrumentId.split(":", 2)
      : ["MKT", r.instrumentId];
    const m = r.metrics;
    const proof = (r.reasons ?? []).slice(1).join(" | ") || r.reasons?.[0] || "";
    lines.push(
      [
        sym,
        venue,
        r.status,
        r.latestEventAt ?? "",
        m?.close ?? "",
        m?.changePct ?? "",
        m?.rsi14 ?? "",
        m?.ema20 ?? "",
        m?.distEma20Pct ?? "",
        m?.sma50 ?? "",
        m?.volRatio ?? "",
        m?.atr14 ?? "",
        m?.atrPct ?? "",
        m?.low20 ?? "",
        m?.high20 ?? "",
        m?.rangePosPct ?? "",
        proof,
      ]
        .map(safeCsvCell)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const slug =
    scan.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "soul-scan";
  link.href = url;
  link.download = `${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatScanBarTimestamp(
  iso: string | null | undefined,
  interval?: string,
): string {
  if (!iso) return "";
  if (interval === "30m" || interval === "1h" || interval === "3h" || interval === "6h") {
    return formatIstMoment(iso);
  }
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  // Daily/Weekly/Monthly bars from NSE/BSE/MCX use IST session midnight UTC (e.g. T18:30:00Z = next day IST)
  // while date-only ECB bars end in T00:00:00.000Z. Format cleanly as a calendar date with zero 12:00 am noise.
  const tz = iso.endsWith("T00:00:00.000Z") ? "UTC" : "Asia/Kolkata";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  }).format(new Date(ms));
}

/**
 * Extracts editable numeric tokens from a Classic AST formula expression so users can
 * adjust indicator periods or thresholds directly without losing AST syntax.
 */
export function extractFormulaParameters(formula: string): FormulaParamToken[] {
  const out: FormulaParamToken[] = [];
  const regex = /\b\d+(?:\.\d+)?\b/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(formula)) !== null && out.length < 4) {
    const start = match.index;
    const end = start + match[0].length;
    const before = formula.slice(Math.max(0, start - 24), start).toLowerCase();
    // Skip numbers embedded inside identifier names like rsi14 or sma20
    if (start > 0 && /[a-z_]/i.test(formula[start - 1])) continue;
    let label = `Param ${idx + 1}`;
    if (/ema\([^)]*,\s*$/.test(before)) label = "EMA period";
    else if (/sma\([^)]*,\s*$/.test(before)) label = "SMA period";
    else if (/rsi\([^)]*,\s*$/.test(before)) label = "RSI period";
    else if (/atr\(\s*$/.test(before)) label = "ATR period";
    else if (/highest\([^)]*,\s*$/.test(before)) label = "High lookback";
    else if (/lowest\([^)]*,\s*$/.test(before)) label = "Low lookback";
    else if (/bb(?:upper|lower)\([^)]*,\s*$/.test(before)) label = "BB param";
    else if (/macd\([^)]*,\s*$/.test(before)) label = "MACD period";
    else if (/change\([^)]*,\s*$/.test(before)) label = "Lookback";
    else if (/[<>!=]=?\s*$/.test(before)) label = "Threshold";
    else if (/[*/+-]\s*$/.test(before)) label = "Multiplier";
    out.push({
      id: `p-${idx}-${start}`,
      label,
      value: match[0],
      start,
      end,
    });
    idx++;
  }
  return out;
}

export function replaceFormulaToken(
  formula: string,
  token: FormulaParamToken,
  nextRaw: string,
): string {
  const trimmed = nextRaw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return formula;
  return formula.slice(0, token.start) + trimmed + formula.slice(token.end);
}
