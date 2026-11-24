"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Info,
  Maximize2,
  Minimize2,
  Save,
  SlidersHorizontal,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  AssetResearch,
  ChartLayout,
  Drawing,
  Interval,
} from "../../../backend/services/market-data/data-types";
import {
  comparableMetrics,
  normalizedComparison,
  assetAnalytics,
  canShowDerived,
} from "../../../backend/engines/chart-analytics";
import { X2_INSTRUMENTS } from "../../../backend/services/market-data/instrument-registry";
import { getEconomicCalendarEvents } from "../../../backend/services/market-data/economic-calendar";
import { computeEventWindowReturn } from "../../../backend/engines/analytics";
import { getCompanyEcosystem } from "../../../backend/services/market-data/sectors-and-ecosystem";
import type { PublishedSoulCard } from "../../../backend/services/community/research-network";
import type { NormalizedMarketQuote } from "../../../backend/services/market-data/angelone/types";
import { fetchMarketQuotes } from "./private-market-client";
import type { EconomicEventChartContext } from "./economic-calendar";

type Props = {
  id: string;
  authenticated?: boolean;
  isOwner?: boolean;
  inWatchlist?: boolean;
  watchlistBusy?: boolean;
  onToggleWatchlist?: (instrumentId: string) => void;
  eventContext?: EconomicEventChartContext | null;
  onRequireAuth?: () => void;
  onClose?: () => void;
  onSelectAsset?: (nextId: string) => void;
  onAnalyze?: (formula?: string, instrumentId?: string) => void;
  notify?: (text: string, error?: boolean) => void;
};

type RangePreset = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
type ResearchTab =
  | "Overview"
  | "Technicals"
  | "Analysis"
  | "Fundamentals"
  | "Ecosystem"
  | "Ideas"
  | "News";

const TABS: readonly ResearchTab[] = [
  "Overview",
  "Technicals",
  "Analysis",
  "Fundamentals",
  "Ecosystem",
  "Ideas",
  "News",
];

const RANGE_PRESETS: readonly RangePreset[] = [
  "1D",
  "1W",
  "1M",
  "3M",
  "1Y",
  "ALL",
];

const emptyLayout: ChartLayout = {
  version: 0,
  payload: { mode: "line", interval: "1d", indicators: [], drawings: [] },
  updatedAt: null,
};

function sanitizeProviderLabel(raw: string | null | undefined): string {
  if (!raw) return "Market data";
  if (/angel\s*one|smartapi|private\s*owner|configured exchange feed/i.test(raw)) {
    return "Exchange data";
  }
  if (/ecb/i.test(raw)) return "ECB Reference";
  return raw;
}

function isIndexInstrument(id: string, asset: AssetResearch | null): boolean {
  if (asset?.instrument?.type === "INDEX") return true;
  return /^(NSE:(NIFTY50|BANKNIFTY|NIFTYMIDCAP100|MIDCPNIFTY|INDIAVIX)|BSE:SENSEX|GLOBAL:(SPX|NDX))$/i.test(
    id,
  );
}

function formatDisplayPrice(
  value: number | null | undefined,
  id: string,
  asset: AssetResearch | null,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (id.startsWith("ECB:")) {
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  if (id.startsWith("UST:") || id.startsWith("TREASURY:")) {
    return `${value.toFixed(2)}%`;
  }
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (isIndexInstrument(id, asset)) return formatted;
  const currency = (asset?.currency || "").toUpperCase();
  if (currency === "INR" || /^(NSE|BSE|MCX):/i.test(id)) return `₹${formatted}`;
  if (currency === "USD" || id === "GLOBAL:CL") return `$${formatted}`;
  return formatted;
}

function formatAxisTick(value: number, id: string): string {
  if (!Number.isFinite(value)) return "";
  if (id.startsWith("ECB:")) return value.toFixed(2);
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString("en-IN");
  }
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatShortDate(raw: string, intraday: boolean): string {
  if (!raw) return "";
  const ms = Date.parse(raw.includes("T") ? raw : `${raw}T00:00:00Z`);
  if (!Number.isFinite(ms)) return raw.slice(0, 10);
  if (intraday) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  }
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(ms));
}

function formatStatusSummary(
  asset: AssetResearch | null,
  ownerQuote: NormalizedMarketQuote | null,
  latestDate: string | null,
): string {
  if (ownerQuote) {
    const timePart = ownerQuote.exchangeTimestampIST
      ? formatShortDate(
          ownerQuote.exchangeTimestampUTC ?? ownerQuote.retrievalTimestampUTC,
          true,
        ) + " IST"
      : null;
    if (ownerQuote.isLive && ownerQuote.quality === "VERIFIED_REAL_LIVE" && ownerQuote.marketState === "OPEN") {
      return timePart ? `Live · ${timePart}` : "Live";
    }
    if (ownerQuote.quality === "MARKET_CLOSED_LAST" || ownerQuote.marketState === "HOLIDAY" || ownerQuote.marketState === "CLOSED") {
      const prefix = ownerQuote.marketState === "HOLIDAY" ? "Holiday" : "Closed";
      return timePart ? `${prefix} · ${timePart}` : prefix;
    }
    if (ownerQuote.quality === "VERIFIED_REAL_DELAYED") {
      return timePart ? `Delayed · ${timePart}` : "Delayed";
    }
    if (ownerQuote.quality === "REAL_BUT_STALE") {
      return timePart ? `Stale · ${timePart}` : "Stale";
    }
  }
  if (!asset) return "Checking market data…";
  if (asset.id.startsWith("ECB:") && latestDate) {
    return `Daily reference · ${formatShortDate(latestDate, false)}`;
  }
  if (asset.state === "PUBLISHED_INTRADAY" && latestDate) {
    return `Intraday · ${formatShortDate(latestDate, true)} IST`;
  }
  if (asset.state === "PUBLISHED_EOD" && latestDate) {
    return `Closed · ${formatShortDate(latestDate, false)}`;
  }
  if (asset.state === "STALE" && latestDate) {
    return `Stale · ${formatShortDate(latestDate, false)}`;
  }
  return "Data unavailable";
}

function venueSubtitle(
  id: string,
  asset: AssetResearch | null,
  ownerQuote: NormalizedMarketQuote | null,
): string {
  const venue = asset?.instrument?.market ?? id.split(":")[0] ?? "MARKET";
  const type = asset?.instrument?.type
    ? asset.instrument.type === "EQUITY"
      ? "Equity"
      : asset.instrument.type === "INDEX"
        ? "Index"
        : asset.instrument.type === "FUTURE"
          ? "Futures"
          : asset.instrument.type === "FX"
            ? "FX Reference"
            : "Yield"
    : id.startsWith("ECB:")
      ? "Daily Reference FX"
      : id.startsWith("MCX:")
        ? "Commodity Futures"
        : isIndexInstrument(id, asset)
          ? "Index"
          : "Market";
  const expiry = ownerQuote?.expiry ?? asset?.instrument?.expiry;
  if (expiry) {
    const expLabel = formatShortDate(expiry, false);
    return `${venue} · ${type} · Exp ${expLabel}`;
  }
  return `${venue} · ${type}`;
}

function rangeDaysForPreset(preset: RangePreset): number | null {
  if (preset === "1D") return 1;
  if (preset === "1W") return 7;
  if (preset === "1M") return 31;
  if (preset === "3M") return 93;
  if (preset === "1Y") return 366;
  return null;
}

const num = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-IN", { maximumFractionDigits: digits });

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const value = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(value.error ?? "Research request failed.");
  return value as T;
}

export default function AssetTerminal({
  id,
  authenticated = true,
  isOwner = false,
  inWatchlist = false,
  watchlistBusy = false,
  onToggleWatchlist,
  eventContext = null,
  onRequireAuth,
  onClose,
  onSelectAsset,
  onAnalyze,
  notify,
}: Props) {
  const [assetEntry, setAssetEntry] = useState<{
    requestedId: string;
    data: AssetResearch;
  } | null>(null);
  const [ownerQuote, setOwnerQuote] = useState<NormalizedMarketQuote | null>(null);
  const [layout, setLayout] = useState<ChartLayout>(emptyLayout);
  const [interval, setInterval] = useState<Interval>("1d");
  const [range, setRange] = useState<RangePreset>("3M");
  const [tab, setTab] = useState<ResearchTab>("Overview");
  const [infoOpen, setInfoOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [windowSize, setWindowSize] = useState(90);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [drawing, setDrawing] = useState({
    type: "level" as Drawing["type"],
    date1: "",
    value1: "",
    date2: "",
    value2: "",
  });
  const [peerId, setPeerId] = useState("NSE:SBIN");
  const [peer, setPeer] = useState<AssetResearch | null>(null);
  const [peerBusy, setPeerBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [chartWidth, setChartWidth] = useState(720);
  const [ideas, setIdeas] = useState<PublishedSoulCard[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);

  const asset = assetEntry?.requestedId === id ? assetEntry.data : null;
  const surface = useRef<HTMLElement>(null);
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef(id);
  const saveRef = useRef(false);
  const peerRef = useRef(false);
  const requestKey = useRef<string | null>(null);
  const loadedId = useRef("");
  const clipId = useId().replaceAll(":", "");

  useEffect(() => {
    activeIdRef.current = id;
  }, [id]);

  // Measure chart container responsively for crisp rendering across 320px–1440px
  useEffect(() => {
    const el = chartBoxRef.current ?? surface.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      queueMicrotask(() => setChartWidth(Math.max(260, el.clientWidth || 720)));
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartWidth(Math.max(260, Math.floor(width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chartFullscreen]);

  // Reset hover and zoom cleanly when asset changes
  useEffect(() => {
    queueMicrotask(() => {
      setHover(null);
      setOffset(0);
      setRange("3M");
      setInfoOpen(false);
      setSaveMessage("");
      setTab("Overview");
    });
  }, [id]);

  // Fetch asset history + layout with stale-response protection
  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const reqId = id;
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
    });
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    const endpoint = authenticated ? "/api/x2/data" : "/api/markets/public";
    json<{ asset: AssetResearch; layout: ChartLayout }>(
      `${endpoint}?id=${encodeURIComponent(reqId)}&interval=${interval}`,
      { signal: ctrl.signal },
    )
      .then((v) => {
        if (!alive || activeIdRef.current !== reqId) return;
        setAssetEntry({ requestedId: reqId, data: v.asset });
        if (loadedId.current !== reqId) {
          loadedId.current = reqId;
          setLayout(v.layout);
          const savedIv = v.layout.payload.interval;
          if (savedIv && savedIv !== interval) {
            if (!(reqId.startsWith("ECB:") && (savedIv === "30m" || savedIv === "1h"))) {
              setInterval(savedIv);
            }
          }
          setWindowSize(90);
          setOffset(0);
          setPeer(null);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!alive || activeIdRef.current !== reqId) return;
        setError(
          e.name === "AbortError"
            ? "Request timed out. Retry without losing your chart."
            : e.message,
        );
        setLoading(false);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timeout);
    };
  }, [authenticated, id, interval, reload]);

  // Fetch owner quote snapshot when entitled on NSE/BSE/MCX
  useEffect(() => {
    if (!authenticated || !isOwner || !/^(NSE|BSE|MCX):/i.test(id)) {
      queueMicrotask(() => setOwnerQuote(null));
      return;
    }
    let alive = true;
    const reqId = id;
    fetchMarketQuotes([reqId])
      .then((res) => {
        if (alive && activeIdRef.current === reqId) {
          setOwnerQuote(res.quotes[0] ?? null);
        }
      })
      .catch(() => {
        if (alive && activeIdRef.current === reqId) setOwnerQuote(null);
      });
    return () => {
      alive = false;
    };
  }, [authenticated, isOwner, id, reload]);

  // Fetch Ideas tab lazily
  useEffect(() => {
    if (tab !== "Ideas") return;
    let alive = true;
    const reqId = id;
    queueMicrotask(() => {
      if (alive) setIdeasLoading(true);
    });
    json<{ posts: PublishedSoulCard[] }>(
      `/api/community/network?view=web&symbol=${encodeURIComponent(reqId)}`,
    )
      .then((res) => {
        if (alive && activeIdRef.current === reqId) setIdeas(res.posts ?? []);
      })
      .catch(() => {
        if (alive && activeIdRef.current === reqId) setIdeas([]);
      })
      .finally(() => {
        if (alive) setIdeasLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, id]);

  const ecosystem = useMemo(
    () => getCompanyEcosystem(id, asset?.name),
    [id, asset?.name],
  );

  const eventWindow = useMemo(() => {
    if (!eventContext) return null;
    return computeEventWindowReturn({
      eventDate: eventContext.eventDate,
      announcedDateOnly: eventContext.announcedDateOnly,
      series: (asset?.references ?? []).map((r) => ({
        date: r.date,
        close: r.close,
      })),
    });
  }, [eventContext, asset]);

  const relatedMacro = useMemo(() => {
    const country =
      id.startsWith("NSE:") ||
      id.startsWith("BSE:") ||
      id.startsWith("MCX:") ||
      id === "ECB:USDINR"
        ? "IN"
        : id.startsWith("UST:") || id === "GLOBAL:SPX" || id === "GLOBAL:NDX"
          ? "US"
          : id.startsWith("ECB:")
            ? "EU"
            : "ALL";
    return getEconomicCalendarEvents({ range: "upcoming", country }).events.slice(
      0,
      5,
    );
  }, [id]);

  function change(next: Partial<ChartLayout["payload"]>) {
    requestKey.current = null;
    setSaveMessage("");
    setLayout((v) => ({ ...v, payload: { ...v.payload, ...next } }));
  }

  async function save() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    setError("");
    setSaveMessage("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const v = await json<{ layout: ChartLayout }>("/api/x2/data", {
        method: "POST",
        body: JSON.stringify({
          id,
          version: layout.version,
          payload: { ...layout.payload, interval },
          requestKey: requestKey.current,
        }),
      });
      setLayout(v.layout);
      requestKey.current = null;
      setSaveMessage(`Layout saved · v${v.layout.version}`);
      notify?.("Chart layout saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  }

  async function compare() {
    if (!canShowDerived(asset)) {
      setError("Analysis and derived-display rights required.");
      return;
    }
    if (peerRef.current) return;
    peerRef.current = true;
    setPeerBusy(true);
    setError("");
    try {
      const endpoint = authenticated ? "/api/x2/data" : "/api/markets/public";
      const v = await json<{ asset: AssetResearch }>(
        `${endpoint}?id=${encodeURIComponent(peerId)}&interval=${interval}`,
      );
      setPeer(v.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      peerRef.current = false;
      setPeerBusy(false);
    }
  }

  const isIntraday = interval === "30m" || interval === "1h";
  const supportsIntraday = !id.startsWith("ECB:") && !id.startsWith("UST:") && !id.startsWith("TREASURY:");
  const rows = useMemo(() => asset?.references ?? [], [asset]);

  // Apply range preset onto genuine loaded observations (never fabricating points)
  const rangedRows = useMemo(() => {
    if (rows.length === 0) return [];
    const days = rangeDaysForPreset(range);
    if (days === null) return rows;
    const latest = rows[rows.length - 1];
    const latestMs = Date.parse(
      latest.date.includes("T") ? latest.date : `${latest.date}T00:00:00Z`,
    );
    if (!Number.isFinite(latestMs)) return rows;
    if (range === "1D" && isIntraday) {
      const latestDay = latest.date.slice(0, 10);
      const dayBars = rows.filter((r) => r.date.slice(0, 10) === latestDay);
      return dayBars.length > 0 ? dayBars : rows.slice(-14);
    }
    const cutoff = latestMs - days * 86_400_000;
    const filtered = rows.filter((r) => {
      const ms = Date.parse(r.date.includes("T") ? r.date : `${r.date}T00:00:00Z`);
      return Number.isFinite(ms) && ms >= cutoff;
    });
    return filtered.length >= 2 ? filtered : rows.slice(-Math.min(rows.length, 5));
  }, [rows, range, isIntraday]);

  const end = Math.max(1, rangedRows.length - offset);
  const start = Math.max(0, end - Math.min(windowSize, rangedRows.length));
  const shown = rangedRows.slice(start, end);
  // Global index offset inside `rows` so indicator overlays align strictly with `shown`
  const globalStart = useMemo(() => {
    if (!shown.length) return 0;
    const idx = rows.findIndex((r) => r.date === shown[0].date);
    return idx >= 0 ? idx : 0;
  }, [rows, shown]);
  const globalEnd = globalStart + shown.length;

  const derivedAllowed = canShowDerived(asset);
  const data = useMemo(() => assetAnalytics(asset), [asset]);
  const comparison = useMemo(
    () =>
      derivedAllowed && canShowDerived(peer) && peer?.interval === interval
        ? normalizedComparison(rows, peer.references).slice(-200)
        : [],
    [rows, peer, interval, derivedAllowed],
  );
  const candleMap = useMemo(
    () => new Map((asset?.candles ?? []).map((c) => [c.date, c])),
    [asset],
  );

  // Compute genuine selected-range return & semantic chart color
  const rangeMetrics = useMemo(() => {
    if (shown.length < 2) {
      return { abs: null as number | null, pct: null as number | null, dir: "flat" as const };
    }
    const first = shown[0].close;
    const last = shown[shown.length - 1].close;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) {
      return { abs: null, pct: null, dir: "flat" as const };
    }
    const abs = last - first;
    const pct = (abs / first) * 100;
    const dir = abs > 1e-9 ? ("pos" as const) : abs < -1e-9 ? ("neg" as const) : ("flat" as const);
    return { abs, pct, dir };
  }, [shown]);

  const seriesStrokeColor =
    rangeMetrics.dir === "pos"
      ? "#42CF91"
      : rangeMetrics.dir === "neg"
        ? "#EF666A"
        : "#929CA7";

  const latestRow = rows.at(-1) ?? null;
  const priorRow = rows.length >= 2 ? rows[rows.length - 2] : null;
  const latestCandle = latestRow ? candleMap.get(latestRow.date) ?? null : null;

  const heroPrice = ownerQuote?.ltp ?? latestRow?.close ?? null;
  const sessionChangeAbs =
    ownerQuote?.change !== undefined && ownerQuote?.change !== null
      ? ownerQuote.change
      : latestRow && priorRow
        ? latestRow.close - priorRow.close
        : null;
  const sessionChangePct =
    ownerQuote?.changePct !== undefined && ownerQuote?.changePct !== null
      ? ownerQuote.changePct
      : latestRow && priorRow && priorRow.close > 0
        ? ((latestRow.close - priorRow.close) / priorRow.close) * 100
        : null;
  const sessionDir =
    sessionChangePct === null
      ? "flat"
      : sessionChangePct > 0
        ? "pos"
        : sessionChangePct < 0
          ? "neg"
          : "flat";

  const priceOverlays = layout.payload.indicators.filter(
    (k) => derivedAllowed && ["SMA20", "EMA20", "BB20"].includes(k),
  );

  const values = shown.flatMap((p) => {
    const c = candleMap.get(p.date);
    return c ? [c.low, c.high] : [p.close];
  });
  for (const k of priceOverlays) {
    const v = data[k as keyof typeof data]
      .slice(globalStart, globalEnd)
      .filter((n): n is number => n !== null);
    values.push(...v);
    if (k === "BB20") {
      values.push(
        ...data.BBUP.slice(globalStart, globalEnd).filter((n): n is number => n !== null),
        ...data.BBLOW.slice(globalStart, globalEnd).filter((n): n is number => n !== null),
      );
    }
  }
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const pad = (high - low || Math.abs(high) * 0.01 || 1) * 0.1;
  const min = low - pad;
  const max = high + pad;

  const chartHeight = chartFullscreen ? 360 : 250;
  const plotTop = 18;
  const plotBottom = chartHeight - 32;
  const plotHeight = plotBottom - plotTop;
  const plotLeft = 54;
  const plotRight = chartWidth - 14;
  const plotWidth = Math.max(120, plotRight - plotLeft);

  const x = (i: number) =>
    plotLeft + (shown.length > 1 ? i / (shown.length - 1) : 0.5) * plotWidth;
  const y = (v: number) =>
    plotTop + ((max - v) / Math.max(1e-9, max - min)) * plotHeight;

  const linePath = (v: (number | null)[]) =>
    v
      .map((p, i) =>
        p === null
          ? ""
          : `${i === 0 || v[i - 1] === null ? "M" : "L"}${x(i).toFixed(2)},${y(p).toFixed(2)}`,
      )
      .join(" ");

  const areaPath = useMemo(() => {
    if (shown.length < 2) return "";
    const pts = shown.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.close).toFixed(2)}`).join(" ");
    return `${pts} L${x(shown.length - 1).toFixed(2)},${plotBottom} L${x(0).toFixed(2)},${plotBottom} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, chartWidth, chartHeight, min, max]);

  const xTicks = useMemo(() => {
    if (shown.length === 0) return [];
    if (shown.length === 1) return [{ idx: 0, label: formatShortDate(shown[0].date, isIntraday) }];
    const count = chartWidth < 400 ? 3 : 5;
    const indices = Array.from({ length: count }, (_, i) =>
      Math.round((i / (count - 1)) * (shown.length - 1)),
    );
    const unique = [...new Set(indices)];
    return unique.map((idx) => ({
      idx,
      label: formatShortDate(shown[idx].date, isIntraday),
    }));
  }, [shown, chartWidth, isIntraday]);

  const point = shown[hover ?? shown.length - 1];
  const currentCandle = point ? candleMap.get(point.date) : null;

  function selectRangePreset(preset: RangePreset) {
    setRange(preset);
    setOffset(0);
    setWindowSize(200);
    setHover(null);
    if (preset === "1D" && supportsIntraday && !isIntraday) {
      setInterval("30m");
    } else if (preset !== "1D" && isIntraday) {
      setInterval("1d");
    }
  }

  function addDrawing() {
    if (!derivedAllowed) {
      setError("Analysis and derived-display rights required.");
      return;
    }
    const value1 = Number(drawing.value1);
    const value2 = Number(drawing.value2);
    if (
      !shown.some((p) => p.date === drawing.date1) ||
      !drawing.value1 ||
      !Number.isFinite(value1) ||
      (drawing.type !== "level" &&
        (!shown.some((p) => p.date === drawing.date2) ||
          !drawing.value2 ||
          !Number.isFinite(value2)))
    ) {
      setError("Use visible source dates and finite price anchors.");
      return;
    }
    if (layout.payload.drawings.length >= 20) {
      setError("Maximum 20 drawings.");
      return;
    }
    change({
      drawings: [
        ...layout.payload.drawings,
        {
          id: crypto.randomUUID(),
          type: drawing.type,
          date1: drawing.date1,
          value1,
          ...(drawing.type === "level" ? {} : { date2: drawing.date2, value2 }),
        },
      ],
    });
  }

  const displayTitle =
    asset?.name ??
    X2_INSTRUMENTS.find((x) => x.id === id)?.name ??
    id;

  return (
    <section ref={surface} className="ss-v31-asset-page" aria-busy={loading}>
      {/* Compact Sticky Top Navigation Bar (Back + Watchlist Bookmark + Consolidated Info) */}
      <header className="ss-v31-asset-topbar">
        {onClose ? (
          <button
            type="button"
            className="ss-v31-icon-btn"
            aria-label="Back to workspace"
            onClick={onClose}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}
        <div className="ss-v31-asset-topbar-right">
          {onToggleWatchlist && (
            <button
              type="button"
              className={
                "ss-v31-icon-btn" + (inWatchlist ? " is-teal-active" : "")
              }
              aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
              aria-pressed={inWatchlist}
              disabled={watchlistBusy}
              onClick={() => onToggleWatchlist(id)}
              title={inWatchlist ? "Saved in Watchlist" : "Add to Watchlist"}
            >
              <Bookmark
                size={18}
                fill={inWatchlist ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
          )}
          <button
            type="button"
            className={"ss-v31-icon-btn" + (infoOpen ? " is-teal-active" : "")}
            aria-label="Source and attribution details"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((v) => !v)}
            title="Data source & attribution"
          >
            <Info size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Consolidated Source & Attribution Disclosure (keeps first screen clean) */}
      {infoOpen && (
        <div className="ss-v31-info-drawer" role="note">
          <div className="ss-v31-info-grid">
            <div>
              <span>Source</span>
              <strong>{sanitizeProviderLabel(asset?.provider)}</strong>
            </div>
            <div>
              <span>Instrument ID</span>
              <strong>{id}</strong>
            </div>
            <div>
              <span>Unit</span>
              <strong>{asset?.unit || "Standard"}</strong>
            </div>
            <div>
              <span>Retrieved</span>
              <strong>
                {asset?.retrievedAt
                  ? formatShortDate(asset.retrievedAt, true) + " IST"
                  : "Unavailable"}
              </strong>
            </div>
          </div>
          {asset?.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ss-v31-source-anchor"
            >
              Official source documentation
            </a>
          )}
          <p className="x1-caption" style={{ margin: "6px 0 0" }}>
            Observed historical market data for private research and education.
            Charts never fabricate missing prices or imply trade execution.
          </p>
        </div>
      )}

      {/* Hero: White Asset Title + Quiet Venue + Tabular Price + Signed Move */}
      <div className="ss-v31-asset-hero">
        <div className="ss-v31-asset-sub">{venueSubtitle(id, asset, ownerQuote)}</div>
        <h1 className="ss-v31-asset-title">{displayTitle}</h1>
        <div className="ss-v31-asset-price-row">
          <strong className="ss-v31-asset-price">
            {formatDisplayPrice(heroPrice, id, asset)}
          </strong>
          {sessionChangePct !== null && (
            <span className={`ss-v31-hero-delta is-${sessionDir}`}>
              {sessionChangeAbs !== null
                ? `${sessionChangeAbs >= 0 ? "+" : ""}${num(sessionChangeAbs, id.startsWith("ECB:") ? 4 : 2)} `
                : ""}
              ({sessionChangePct >= 0 ? "+" : ""}
              {sessionChangePct.toFixed(2)}%)
              <small> Session</small>
            </span>
          )}
        </div>
        <div className="ss-v31-asset-meta-line">
          <span>{formatStatusSummary(asset, ownerQuote, latestRow?.date ?? null)}</span>
          {rangeMetrics.pct !== null && (
            <span className={`ss-v31-range-chip is-${rangeMetrics.dir}`}>
              {range}: {rangeMetrics.pct >= 0 ? "+" : ""}
              {rangeMetrics.pct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="x2-error ss-v31-error-bar">
          <span>{error}</span>
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {eventContext && eventWindow && (
        <div
          className="x1-callout"
          style={{ marginBottom: 10 }}
          role="region"
          aria-label="Economic event chart context"
        >
          <strong>
            Event Marker: {eventContext.eventTitle} ({eventContext.eventDate})
          </strong>
          <p className="x1-caption" style={{ margin: "4px 0 0" }}>
            {eventWindow.value?.observedWindowReturnPct !== null &&
            eventWindow.value?.observedWindowReturnPct !== undefined
              ? `${eventWindow.value.observedWindowReturnPct > 0 ? "+" : ""}${eventWindow.value.observedWindowReturnPct.toFixed(2)}% (${eventWindow.value.anchorBeforeDate} → ${eventWindow.value.anchorAfterDate}) · Observed after event.`
              : eventWindow.value?.statusNote}
          </p>
        </div>
      )}

      {/* CHART-FIRST SECTION (Always immediately visible above the fold!) */}
      <div
        ref={chartBoxRef}
        className={
          "ss-v31-chart-card" + (chartFullscreen ? " is-fullscreen" : "")
        }
      >
        {loading && !asset ? (
          <div className="ss-v31-chart-empty" role="status">
            Loading chart observations…
          </div>
        ) : shown.length > 0 ? (
          <>
            {/* Compact live crosshair readout + zoom/fullscreen buttons */}
            <div className="ss-v31-chart-head">
              <div className="ss-v31-readout" aria-live="polite">
                {point ? (
                  <>
                    <span>{formatShortDate(point.date, isIntraday)}</span>
                    <strong>{formatDisplayPrice(point.close, id, asset)}</strong>
                    {currentCandle && (
                      <span className="ss-v31-ohlc-inline">
                        O {num(currentCandle.open)} · H {num(currentCandle.high)} · L{" "}
                        {num(currentCandle.low)}
                      </span>
                    )}
                  </>
                ) : null}
              </div>
              <div className="ss-v31-chart-mini-tools">
                <button
                  type="button"
                  aria-label="Zoom in"
                  disabled={windowSize <= 14}
                  onClick={() => setWindowSize((n) => Math.max(14, n - 20))}
                >
                  <ZoomIn size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={windowSize >= rangedRows.length}
                  onClick={() =>
                    setWindowSize((n) => Math.min(rangedRows.length, n + 20))
                  }
                >
                  <ZoomOut size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Pan earlier"
                  disabled={start === 0}
                  onClick={() =>
                    setOffset((n) =>
                      Math.min(Math.max(0, rangedRows.length - 14), n + 15),
                    )
                  }
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Pan later"
                  disabled={offset === 0}
                  onClick={() => setOffset((n) => Math.max(0, n - 15))}
                >
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={chartFullscreen ? "Exit fullscreen chart" : "Fullscreen chart"}
                  onClick={() => setChartFullscreen((v) => !v)}
                >
                  {chartFullscreen ? (
                    <Minimize2 size={15} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="x2-price-chart ss-v31-price-svg ss-v3-colored-svg"
              style={{ touchAction: "pan-y" }}
              role="img"
              aria-label={`${displayTitle} ${layout.payload.mode} price chart for ${range}`}
              onPointerMove={(e) => {
                if (shown.length < 2) return;
                const box = e.currentTarget.getBoundingClientRect();
                const ratio =
                  (((e.clientX - box.left) / Math.max(1, box.width)) * chartWidth -
                    plotLeft) /
                  plotWidth;
                setHover(
                  Math.max(
                    0,
                    Math.min(shown.length - 1, Math.round(ratio * (shown.length - 1))),
                  ),
                );
              }}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={plotLeft}
                    y={plotTop - 4}
                    width={plotWidth}
                    height={plotHeight + 8}
                  />
                </clipPath>
                <linearGradient
                  id={`${clipId}-area`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={seriesStrokeColor}
                    stopOpacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stopColor={seriesStrokeColor}
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((i) => {
                const gy = plotTop + (plotHeight * i) / 3;
                const val = max - ((max - min) * i) / 3;
                return (
                  <g key={i}>
                    <line
                      x1={plotLeft}
                      x2={plotRight}
                      y1={gy}
                      y2={gy}
                      stroke="rgba(146,156,167,0.14)"
                      strokeWidth="1"
                    />
                    <text
                      x={plotLeft - 6}
                      y={gy + 4}
                      textAnchor="end"
                      fill="#929CA7"
                      fontSize="10.5"
                    >
                      {formatAxisTick(val, id)}
                    </text>
                  </g>
                );
              })}

              <g clipPath={`url(#${clipId})`}>
                {layout.payload.mode === "line" || !asset?.capabilities.candles ? (
                  <>
                    {areaPath && (
                      <path d={areaPath} fill={`url(#${clipId}-area)`} />
                    )}
                    {shown.length >= 2 ? (
                      <path
                        d={linePath(shown.map((p) => p.close))}
                        fill="none"
                        stroke={seriesStrokeColor}
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <circle
                        cx={x(0)}
                        cy={y(shown[0].close)}
                        r="4.5"
                        fill={seriesStrokeColor}
                      />
                    )}
                  </>
                ) : (
                  shown.map((p, i) => {
                    const c = candleMap.get(p.date);
                    if (!c) return null;
                    const up = c.close >= c.open;
                    const color = up ? "#42CF91" : "#EF666A";
                    const bodyW = Math.max(2.5, (plotWidth * 0.56) / shown.length);
                    return (
                      <g key={p.date}>
                        <line
                          x1={x(i)}
                          x2={x(i)}
                          y1={y(c.high)}
                          y2={y(c.low)}
                          stroke={color}
                          strokeWidth="1.2"
                        />
                        {layout.payload.mode === "candles" ? (
                          <rect
                            x={x(i) - bodyW / 2}
                            y={Math.min(y(c.open), y(c.close))}
                            width={bodyW}
                            height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))}
                            fill={color}
                            rx="1"
                          />
                        ) : (
                          <>
                            <line
                              x1={x(i) - 4}
                              x2={x(i)}
                              y1={y(c.open)}
                              y2={y(c.open)}
                              stroke={color}
                              strokeWidth="1.5"
                            />
                            <line
                              x1={x(i)}
                              x2={x(i) + 4}
                              y1={y(c.close)}
                              y2={y(c.close)}
                              stroke={color}
                              strokeWidth="1.5"
                            />
                          </>
                        )}
                      </g>
                    );
                  })
                )}

                {priceOverlays.map((k, i) => (
                  <path
                    key={k}
                    d={linePath(
                      data[k as keyof typeof data].slice(globalStart, globalEnd),
                    )}
                    fill="none"
                    stroke={i % 2 === 0 ? "#4FA3A1" : "#78BFFF"}
                    strokeWidth="1.4"
                    strokeDasharray={i % 2 ? "3 3" : "6 3"}
                  />
                ))}

                {derivedAllowed &&
                  layout.payload.indicators.includes("BB20") &&
                  (["BBUP", "BBLOW"] as const).map((k) => (
                    <path
                      key={k}
                      d={linePath(data[k].slice(globalStart, globalEnd))}
                      fill="none"
                      stroke="rgba(120,191,255,0.55)"
                      strokeWidth="1.1"
                      strokeDasharray="3 4"
                    />
                  ))}

                {derivedAllowed &&
                  layout.payload.drawings.map((d) => {
                    const a = shown.findIndex((p) => p.date === d.date1);
                    const b = shown.findIndex((p) => p.date === d.date2);
                    if (a < 0) return null;
                    if (d.type === "level") {
                      return (
                        <line
                          key={d.id}
                          x1={plotLeft}
                          x2={plotRight}
                          y1={y(d.value1)}
                          y2={y(d.value1)}
                          stroke="#79BFBD"
                          strokeWidth="1.3"
                          strokeDasharray="4 4"
                        />
                      );
                    }
                    if (b < 0 || d.value2 === undefined) return null;
                    if (d.type === "fibonacci") {
                      return (
                        <g key={d.id}>
                          {[0, 0.236, 0.382, 0.5, 0.618, 1].map((r) => (
                            <line
                              key={r}
                              x1={Math.min(x(a), x(b))}
                              x2={plotRight}
                              y1={y(d.value1 + (d.value2! - d.value1) * r)}
                              y2={y(d.value1 + (d.value2! - d.value1) * r)}
                              stroke="#4FA3A1"
                              strokeOpacity="0.65"
                              strokeWidth="1"
                            />
                          ))}
                        </g>
                      );
                    }
                    const endpoint = d.type === "ray" && a !== b ? plotRight : x(b);
                    const lastY =
                      d.type === "ray" && a !== b
                        ? y(d.value1) +
                          ((y(d.value2) - y(d.value1)) * (plotRight - x(a))) /
                            (x(b) - x(a))
                        : y(d.value2);
                    return (
                      <line
                        key={d.id}
                        x1={x(a)}
                        y1={y(d.value1)}
                        x2={endpoint}
                        y2={lastY}
                        stroke="#79BFBD"
                        strokeWidth="1.4"
                      />
                    );
                  })}

                {point && hover !== null && (
                  <>
                    <line
                      x1={x(hover)}
                      x2={x(hover)}
                      y1={plotTop}
                      y2={plotBottom}
                      stroke="rgba(197,205,213,0.38)"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={x(hover)}
                      cy={y(point.close)}
                      r="4"
                      fill={seriesStrokeColor}
                      stroke="#090B0D"
                      strokeWidth="1.5"
                    />
                  </>
                )}
              </g>

              {xTicks.map((t, idx) => (
                <text
                  key={`${t.idx}-${t.label}`}
                  x={x(t.idx)}
                  y={chartHeight - 10}
                  textAnchor={
                    idx === 0
                      ? "start"
                      : idx === xTicks.length - 1
                        ? "end"
                        : "middle"
                  }
                  fill="#929CA7"
                  fontSize="10.5"
                >
                  {t.label}
                </text>
              ))}
            </svg>
          </>
        ) : (
          <div className="ss-v31-chart-empty">
            <p style={{ margin: 0 }}>
              Historical chart observations are not connected for this instrument
              yet. No synthetic prices are plotted.
            </p>
          </div>
        )}

        {/* Horizontal Range Selector (1D · 1W · 1M · 3M · 1Y · ALL) */}
        <div className="ss-v31-range-bar" role="group" aria-label="Chart range">
          {RANGE_PRESETS.map((preset) => {
            const disabled = preset === "1D" && !supportsIntraday;
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                aria-pressed={range === preset}
                title={
                  disabled
                    ? "1D intraday bars are unavailable for daily-only feeds"
                    : `Show ${preset}`
                }
                className={
                  "ss-v31-range-btn" + (range === preset ? " is-active" : "")
                }
                onClick={() => selectRangePreset(preset)}
              >
                {preset}
              </button>
            );
          })}
        </div>

        {/* Compact Chart Options Row (View, Interval, Indicators toggle) */}
        <div className="ss-v31-chart-opts">
          <div className="ss-v31-mini-seg" role="group" aria-label="Chart style">
            <button
              type="button"
              aria-pressed={layout.payload.mode === "line"}
              className={layout.payload.mode === "line" ? "is-active" : ""}
              onClick={() => change({ mode: "line" })}
            >
              Line
            </button>
            <button
              type="button"
              disabled={!asset?.capabilities.candles}
              aria-pressed={layout.payload.mode === "candles"}
              className={layout.payload.mode === "candles" ? "is-active" : ""}
              title={
                asset?.capabilities.candles
                  ? "Candlestick chart"
                  : "Candles require OHLC source data"
              }
              onClick={() => change({ mode: "candles" })}
            >
              Candles
            </button>
          </div>

          <label className="ss-v31-compact-select">
            <span className="x2-sr-only">Bar interval</span>
            <select
              id="ss-v31-asset-interval"
              name="assetInterval"
              value={interval}
              onChange={(e) => {
                requestKey.current = null;
                setInterval(e.target.value as Interval);
                setOffset(0);
              }}
            >
              <option value="30m" disabled={!supportsIntraday}>
                30m
              </option>
              <option value="1h" disabled={!supportsIntraday}>
                1 Hour
              </option>
              <option value="1d">Daily</option>
              <option value="1wk" disabled={!derivedAllowed}>
                Weekly
              </option>
              <option value="1mo" disabled={!derivedAllowed}>
                Monthly
              </option>
            </select>
          </label>

          <button
            type="button"
            className={
              "ss-v31-tool-btn" + (indicatorsOpen ? " is-teal-active" : "")
            }
            aria-expanded={indicatorsOpen}
            disabled={!derivedAllowed}
            onClick={() => setIndicatorsOpen((v) => !v)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>
              Indicators
              {layout.payload.indicators.length > 0
                ? ` (${layout.payload.indicators.length})`
                : ""}
            </span>
          </button>
        </div>

        {indicatorsOpen && derivedAllowed && (
          <div className="ss-v31-indicator-drawer">
            <div className="x51-chip-row" role="group" aria-label="Technical indicators">
              {["SMA20", "EMA20", "BB20", "RSI14", "MACD", "ATR14", "DRAWDOWN"].map(
                (k) => {
                  const active = layout.payload.indicators.includes(k);
                  const disabled = k === "ATR14" && !asset?.capabilities.candles;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      className={
                        "x51-chip" + (active ? " is-teal-chip" : "")
                      }
                      onClick={() =>
                        change({
                          indicators: active
                            ? layout.payload.indicators.filter((x) => x !== k)
                            : [...layout.payload.indicators, k],
                        })
                      }
                    >
                      {k}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Strip: Blue Scan Asset + Teal Watchlist + Save Layout */}
      <div className="ss-v31-asset-cta-row">
        <button
          type="button"
          className="ss-v3-run-cta ss-v31-scan-asset-btn"
          disabled={!onAnalyze}
          onClick={() => onAnalyze?.("", id)}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span>Scan Asset</span>
        </button>
        {onToggleWatchlist && (
          <button
            type="button"
            className={
              "ss-v31-teal-outline-btn" + (inWatchlist ? " is-active" : "")
            }
            disabled={watchlistBusy}
            onClick={() => onToggleWatchlist(id)}
          >
            <Bookmark
              size={15}
              fill={inWatchlist ? "currentColor" : "none"}
              aria-hidden="true"
            />
            <span>{inWatchlist ? "Saved" : "Watchlist"}</span>
          </button>
        )}
        <button
          type="button"
          className="x1-secondary ss-v31-save-layout-btn"
          disabled={saving || loading || !asset}
          aria-busy={saving}
          onClick={save}
          title="Save chart indicators and drawings"
        >
          <Save size={15} aria-hidden="true" />
          <span>{saving ? "Saving…" : "Save"}</span>
        </button>
      </div>
      {saveMessage && (
        <p role="status" className="x1-caption" style={{ margin: "2px 0 6px" }}>
          {saveMessage}
        </p>
      )}

      {/* Sub-indicator panels when enabled */}
      {layout.payload.indicators
        .filter(
          (k) =>
            derivedAllowed &&
            ["RSI14", "MACD", "ATR14", "DRAWDOWN"].includes(k),
        )
        .map((k) => {
          const vals = data[k as keyof typeof data].slice(globalStart, globalEnd);
          const finite = vals.filter((v): v is number => v !== null);
          const lo = finite.length ? Math.min(...finite) : 0;
          const hi = finite.length ? Math.max(...finite) : 1;
          const py = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * 64;
          return (
            <div className="x2-indicator-panel" key={k}>
              <strong>
                {k} · {num(vals.at(-1))}
                {k === "RSI14" || k === "DRAWDOWN" ? "%" : ""}
              </strong>
              {finite.length ? (
                <svg
                  viewBox={`0 0 ${chartWidth} 80`}
                  className="ss-v3-colored-svg"
                  role="img"
                  aria-label={`${k} indicator series`}
                >
                  <path
                    d={vals
                      .map((v, i) =>
                        v === null
                          ? ""
                          : `${i === 0 || vals[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${py(v).toFixed(1)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="#4FA3A1"
                    strokeWidth="1.6"
                  />
                </svg>
              ) : (
                <p className="x1-caption">Insufficient warm-up observations.</p>
              )}
            </div>
          );
        })}

      {/* Clean Underline Tabs (No clipping, teal active underline) */}
      <nav
        className="ss-v31-underline-tabs"
        role="tablist"
        aria-label="Asset research sections"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={
              "ss-v31-underline-tab" + (tab === t ? " is-active" : "")
            }
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* TAB CONTENT */}
      <div className="ss-v31-asset-tab-body">
        {tab === "Overview" && (
          <div className="ss-v31-overview-stack">
            <div className="ss-v31-stats-grid" aria-label="Key market statistics">
              <div className="ss-v31-stat-box">
                <span>Open</span>
                <strong>
                  {formatDisplayPrice(
                    ownerQuote?.open ?? latestCandle?.open ?? null,
                    id,
                    asset,
                  )}
                </strong>
              </div>
              <div className="ss-v31-stat-box">
                <span>Prev Close</span>
                <strong>
                  {formatDisplayPrice(
                    ownerQuote?.prevClose ?? priorRow?.close ?? null,
                    id,
                    asset,
                  )}
                </strong>
              </div>
              <div className="ss-v31-stat-box">
                <span>Day High</span>
                <strong>
                  {formatDisplayPrice(
                    ownerQuote?.high ?? latestCandle?.high ?? null,
                    id,
                    asset,
                  )}
                </strong>
              </div>
              <div className="ss-v31-stat-box">
                <span>Day Low</span>
                <strong>
                  {formatDisplayPrice(
                    ownerQuote?.low ?? latestCandle?.low ?? null,
                    id,
                    asset,
                  )}
                </strong>
              </div>
              <div className="ss-v31-stat-box">
                <span>Volume</span>
                <strong>
                  {num(ownerQuote?.volume ?? latestCandle?.volume ?? null, 0)}
                </strong>
              </div>
              <div className="ss-v31-stat-box">
                <span>Range Return ({range})</span>
                <strong className={`ss-v31-txt-${rangeMetrics.dir}`}>
                  {rangeMetrics.pct !== null
                    ? `${rangeMetrics.pct >= 0 ? "+" : ""}${rangeMetrics.pct.toFixed(2)}%`
                    : "—"}
                </strong>
              </div>
            </div>

            {asset?.capabilities.volume && shown.length > 0 && (
              <div className="x2-indicator-panel">
                <strong>
                  Volume ({asset.instrument?.type === "FUTURE" ? "contracts" : "shares"})
                </strong>
                <svg
                  viewBox={`0 0 ${chartWidth} 76`}
                  className="ss-v3-colored-svg"
                  role="img"
                  aria-label="Observed trading volume bars"
                >
                  {shown.map((p, i) => {
                    const volume = candleMap.get(p.date)?.volume;
                    const maxVolume = Math.max(
                      1,
                      ...shown.map((d) => candleMap.get(d.date)?.volume ?? 0),
                    );
                    if (volume == null) return null;
                    const c = candleMap.get(p.date);
                    const up = c ? c.close >= c.open : true;
                    return (
                      <rect
                        key={p.date}
                        x={x(i) - 2}
                        y={68 - (volume / maxVolume) * 58}
                        width={Math.max(1.5, (plotWidth / shown.length) * 0.58)}
                        height={(volume / maxVolume) * 58}
                        fill={up ? "rgba(66,207,145,0.45)" : "rgba(239,102,106,0.45)"}
                      />
                    );
                  })}
                </svg>
              </div>
            )}

            {shown.length > 0 && (
              <details className="ss-v31-adv-disclosure">
                <summary>Price/date drawing tools</summary>
                <fieldset
                  disabled={!derivedAllowed}
                  style={{ border: 0, padding: "10px 0 0", margin: 0 }}
                >
                  <div className="x2-drawing-form">
                    <label>
                      Tool
                      <select
                        value={drawing.type}
                        onChange={(e) =>
                          setDrawing((v) => ({
                            ...v,
                            type: e.target.value as Drawing["type"],
                          }))
                        }
                      >
                        <option value="level">Horizontal level</option>
                        <option value="trend">Trendline</option>
                        <option value="ray">Ray</option>
                        <option value="fibonacci">Fibonacci</option>
                      </select>
                    </label>
                    <label>
                      First date
                      <input
                        type="date"
                        value={drawing.date1}
                        onChange={(e) =>
                          setDrawing((v) => ({ ...v, date1: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      First price
                      <input
                        type="number"
                        step="any"
                        value={drawing.value1}
                        onChange={(e) =>
                          setDrawing((v) => ({ ...v, value1: e.target.value }))
                        }
                      />
                    </label>
                    {drawing.type !== "level" && (
                      <>
                        <label>
                          Second date
                          <input
                            type="date"
                            value={drawing.date2}
                            onChange={(e) =>
                              setDrawing((v) => ({ ...v, date2: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Second price
                          <input
                            type="number"
                            step="any"
                            value={drawing.value2}
                            onChange={(e) =>
                              setDrawing((v) => ({ ...v, value2: e.target.value }))
                            }
                          />
                        </label>
                      </>
                    )}
                    <button type="button" onClick={addDrawing}>
                      Add drawing
                    </button>
                    <button
                      type="button"
                      disabled={!layout.payload.drawings.length}
                      onClick={() =>
                        change({
                          drawings: layout.payload.drawings.slice(0, -1),
                        })
                      }
                    >
                      Undo last
                    </button>
                  </div>
                </fieldset>
              </details>
            )}

            {shown.length > 0 && (
              <details className="ss-v31-adv-disclosure">
                <summary>
                  Accessible source table · {shown.length} observations
                </summary>
                <div className="x2-table-scroll" style={{ marginTop: 8 }}>
                  <table>
                    <caption>
                      {sanitizeProviderLabel(asset?.provider)} · {asset?.unit}
                    </caption>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Close</th>
                        <th>Open</th>
                        <th>High</th>
                        <th>Low</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.slice(-40).reverse().map((p) => {
                        const c = candleMap.get(p.date);
                        return (
                          <tr key={p.date}>
                            <td>{formatShortDate(p.date, isIntraday)}</td>
                            <td>{num(p.close, id.startsWith("ECB:") ? 4 : 2)}</td>
                            <td>{num(c?.open)}</td>
                            <td>{num(c?.high)}</td>
                            <td>{num(c?.low)}</td>
                            <td>{num(c?.volume, 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {tab === "Technicals" &&
          (!derivedAllowed ? (
            <p className="x1-caption">
              Analysis and derived-display rights are required to calculate
              technical indicators for this instrument.
            </p>
          ) : (
            <>
              <p className="x1-caption" style={{ marginTop: 0 }}>
                Calculated from {rows.length} {interval} observations. Warm-up
                periods stay blank rather than estimated.
              </p>
              <div className="x2-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Indicator</th>
                      <th>Latest value</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data)
                      .filter(([k]) => !["BBUP", "BBLOW"].includes(k))
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{num(v.at(-1), id.startsWith("ECB:") ? 4 : 2)}</td>
                          <td>
                            {k === "RSI14" || k === "DRAWDOWN" ? "%" : asset?.unit}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <details className="ss-v31-adv-disclosure" style={{ marginTop: 12 }}>
                <summary>Peer / Benchmark Comparison</summary>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <label>
                    Benchmark
                    <select
                      value={peerId}
                      onChange={(e) => setPeerId(e.target.value)}
                    >
                      {X2_INSTRUMENTS.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="x1-secondary"
                    onClick={compare}
                    disabled={peerBusy || !derivedAllowed}
                    aria-busy={peerBusy}
                  >
                    {peerBusy ? "Comparing…" : "Compare"}
                  </button>
                </div>
                {peer && comparison.length > 1 && (
                  <div className="x2-indicator-panel" style={{ marginTop: 10 }}>
                    <strong>
                      Rebased to 100 · {comparison.length} matched dates
                    </strong>
                    <svg
                      viewBox={`0 0 ${chartWidth} 150`}
                      className="ss-v3-colored-svg"
                      role="img"
                      aria-label="Normalized peer comparison"
                    >
                      {(["left", "right"] as const).map((key, index) => {
                        const lo = Math.min(
                          ...comparison.flatMap((p) => [p.left, p.right]),
                        );
                        const hi = Math.max(
                          ...comparison.flatMap((p) => [p.left, p.right]),
                        );
                        return (
                          <path
                            key={key}
                            d={comparison
                              .map(
                                (p, i) =>
                                  `${i ? "L" : "M"}${20 + (i / (comparison.length - 1)) * (chartWidth - 40)},${12 + ((hi - p[key]) / (hi - lo || 1)) * 124}`,
                              )
                              .join(" ")}
                            fill="none"
                            stroke={index === 0 ? "#4FA3A1" : "#78BFFF"}
                            strokeWidth="1.8"
                            strokeDasharray={index ? "6 4" : undefined}
                          />
                        );
                      })}
                    </svg>
                    <div className="x2-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Metric</th>
                            <th>Selected</th>
                            <th>Peer</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparableMetrics(
                            derivedAllowed && canShowDerived(peer)
                              ? (asset?.fundamentals ?? [])
                              : [],
                            peer.fundamentals,
                          ).map((m) => (
                            <tr key={m.metric}>
                              <td>{m.metric}</td>
                              <td>{num(m.left)}</td>
                              <td>{num(m.right)}</td>
                              <td>{m.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </details>
            </>
          ))}

        {tab === "Analysis" && (
          <div className="x51-genome-grid">
            <div className="x51-genome-card">
              <h4>Data Lineage &amp; Rights</h4>
              <dl style={{ margin: 0 }}>
                <dt>Source</dt>
                <dd>{sanitizeProviderLabel(asset?.provider)}</dd>
                <dt>Retrieved</dt>
                <dd>
                  {asset?.retrievedAt
                    ? formatShortDate(asset.retrievedAt, true) + " IST"
                    : "Unavailable"}
                </dd>
                <dt>Analysis rights</dt>
                <dd>
                  {asset?.capabilities.analysis ? "Permitted" : "Restricted"}
                </dd>
              </dl>
              {asset?.sourceUrl && (
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-v31-source-anchor"
                >
                  Official documentation
                </a>
              )}
            </div>
            <div className="x51-genome-card">
              <h4>Upcoming Macro Releases</h4>
              {relatedMacro.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {relatedMacro.map((ev) => (
                    <li key={ev.eventId} style={{ marginBottom: 6 }}>
                      <strong>{ev.title}</strong> ({ev.scheduledDate}) ·{" "}
                      <a
                        href={ev.primarySourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {ev.canonicalSourceId}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="x1-caption">No upcoming scheduled macro releases matched.</p>
              )}
            </div>
          </div>
        )}

        {tab === "Fundamentals" && (
          <>
            {asset?.instrument?.type === "FUTURE" || id.startsWith("MCX:") ? (
              <div className="x1-callout">
                <strong>Contract Specifications</strong>
                <p className="x1-caption" style={{ margin: "6px 0 0" }}>
                  {asset?.instrument?.expiry
                    ? `Expiry ${asset.instrument.expiry} · Lot ${asset.instrument.lotSize ?? "—"} · Tick ${asset.instrument.tickSize ?? "—"} · ${asset.instrument.unit}. `
                    : ""}
                  Company accounting ratios (P/E, EPS, Balance Sheet) do not
                  apply to commodity futures contracts.
                </p>
              </div>
            ) : asset?.fundamentals.length ? (
              <div className="x2-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                      <th>Period</th>
                      <th>Filing date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.fundamentals.map((f) => (
                      <tr key={f.metric}>
                        <td>{f.metric}</td>
                        <td>
                          {num(f.value)} {f.unit}
                        </td>
                        <td>{f.period}</td>
                        <td>{f.knownAt ?? "Not disclosed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="x1-caption">
                {id.startsWith("ECB:") ||
                id.startsWith("UST:") ||
                id.startsWith("GLOBAL:") ||
                isIndexInstrument(id, asset)
                  ? "Company financial ratios (P/E, EPS, Balance Sheet) do not apply to market indices, FX benchmarks, or sovereign yields."
                  : "No licensed equity fundamentals feed is connected yet. Missing financial ratios are never fabricated."}
              </p>
            )}
          </>
        )}

        {tab === "Ecosystem" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "1rem", color: "#F4F6F8" }}>
                {ecosystem.companyName} · {ecosystem.sectorName}
              </h3>
              {ecosystem.groupAffiliation && (
                <p className="x1-caption" style={{ margin: "0 0 4px" }}>
                  Structure: <strong>{ecosystem.groupAffiliation}</strong>
                </p>
              )}
              <p className="x1-caption" style={{ margin: 0 }}>{ecosystem.overview}</p>
            </div>
            {ecosystem.edges.length > 0 ? (
              <div className="x52-news-grid">
                {ecosystem.edges.map((edge, idx) => (
                  <div key={`${edge.targetName}-${idx}`} className="x52-news-card">
                    <div>
                      <div className="x52-news-meta" style={{ marginBottom: 4 }}>
                        <span className="x51-pill">{edge.relation.replaceAll("_", " ")}</span>
                        <span
                          className={
                            edge.confidenceClass === "DOCUMENTED"
                              ? "ss-v31-teal-pill"
                              : "x51-pill"
                          }
                        >
                          {edge.confidenceClass === "DOCUMENTED"
                            ? "Documented"
                            : "Exposure"}
                        </span>
                      </div>
                      <h3>{edge.targetName}</h3>
                      <p className="x1-caption" style={{ margin: "4px 0" }}>
                        {edge.summary}
                      </p>
                    </div>
                    <div className="x52-news-meta" style={{ flexWrap: "wrap", gap: 6 }}>
                      <a
                        href={edge.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ss-v31-source-anchor"
                      >
                        {edge.sourceCitation} ({edge.evidenceDate})
                      </a>
                      {edge.targetId && onSelectAsset && (
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => onSelectAsset(edge.targetId!)}
                        >
                          Inspect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="x1-caption">
                No curated peer network is mapped for this instrument yet.
              </p>
            )}
          </div>
        )}

        {tab === "Ideas" && (
          <div>
            <p className="x1-caption" style={{ marginTop: 0 }}>
              Published Community Souls referencing <strong>{displayTitle}</strong>.
              Independent research notes only.
            </p>
            {ideasLoading ? (
              <p role="status" className="x1-caption">
                Loading Community Ideas…
              </p>
            ) : ideas.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ideas.map((post) => (
                  <article key={post.id} className="x51-soul-card">
                    <div className="x51-soul-card-head">
                      <strong>
                        {post.title} · @{post.authorHandle}
                      </strong>
                      <span className="ss-v31-teal-pill">
                        {post.mode} · {post.timeframe}
                      </span>
                    </div>
                    <p className="x1-caption" style={{ margin: 0 }}>
                      {post.summary}
                    </p>
                    <code className="x51-soul-formula">{post.formula}</code>
                  </article>
                ))}
              </div>
            ) : (
              <div className="x1-callout">
                No Community Souls match <strong>{displayTitle}</strong> yet.
                Tap Scan Asset above to study it in Strategy.
              </div>
            )}
          </div>
        )}

        {tab === "News" &&
          (asset?.events.length ? (
            asset.events.map((e) => (
              <article key={e.sourceUrl + e.date} style={{ marginBottom: 10 }}>
                <span className="x1-caption">
                  {e.date} · {e.type}
                </span>{" "}
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {e.title}
                </a>
              </article>
            ))
          ) : (
            <div className="x1-callout">
              <p style={{ margin: "0 0 8px" }}>
                No licensed news feed is connected for{" "}
                <strong>{displayTitle}</strong> yet. Headlines are never
                fabricated.
              </p>
              {asset?.sourceUrl && (
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ss-v31-source-anchor"
                >
                  Open official {sanitizeProviderLabel(asset.provider)} reference
                </a>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
