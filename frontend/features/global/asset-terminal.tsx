"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Info,
  Save,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ArrowRight,
  X,
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
type Props = {
  id: string;
  onClose?: () => void;
  onAnalyze?: (formula?: string, instrumentId?: string) => void;
  notify?: (text: string, error?: boolean) => void;
};
const emptyLayout: ChartLayout = {
  version: 0,
  payload: { mode: "line", interval: "1d", indicators: [], drawings: [] },
  updatedAt: null,
};
const num = (v: number | null | undefined) =>
  v == null
    ? "Unavailable"
    : v.toLocaleString("en-IN", { maximumFractionDigits: 5 });
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
    value = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(value.error ?? "Research request failed.");
  return value as T;
}
export default function AssetTerminal({
  id,
  onClose,
  onAnalyze,
  notify,
}: Props) {
  const [assetState, setAsset] = useState<AssetResearch | null>(null),
    [layout, setLayout] = useState<ChartLayout>(emptyLayout),
    [interval, setInterval] = useState<Interval>("1d"),
    [tab, setTab] = useState("Chart"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [saveMessage, setSaveMessage] = useState(""),
    [windowSize, setWindowSize] = useState(90),
    [offset, setOffset] = useState(0),
    [hover, setHover] = useState<number | null>(null),
    [drawing, setDrawing] = useState({
      type: "level" as Drawing["type"],
      date1: "",
      value1: "",
      date2: "",
      value2: "",
    }),
    [peerId, setPeerId] = useState("NSE:SBIN"),
    [peer, setPeer] = useState<AssetResearch | null>(null),
    [peerBusy, setPeerBusy] = useState(false),
    [reload, setReload] = useState(0),
    [chartWidth, setChartWidth] = useState(760);
  const asset = assetState?.id === id ? assetState : null;
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!surface.current) return;
    if (typeof ResizeObserver === "undefined") {
      queueMicrotask(() =>
        setChartWidth(Math.max(160, surface.current?.clientWidth ?? 760)),
      );
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartWidth(Math.max(160, Math.floor(width)));
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);
  const saveRef = useRef(false),
    peerRef = useRef(false),
    requestKey = useRef<string | null>(null),
    loadedId = useRef(""),
    clipId = useId().replaceAll(":", "");
  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    queueMicrotask(() => {
      setLoading(true);
      setError("");
    });
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    json<{ asset: AssetResearch; layout: ChartLayout }>(
      "/api/x2/data?id=" + encodeURIComponent(id) + "&interval=" + interval,
      { signal: ctrl.signal },
    )
      .then((v) => {
        if (!alive) return;
        setAsset(v.asset);
        if (loadedId.current !== id) {
          loadedId.current = id;
          setLayout(v.layout);
          setInterval(v.layout.payload.interval);
          setWindowSize(90);
          setOffset(0);
          setPeer(null);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setError(
            e.name === "AbortError"
              ? "Request timed out. Retry without losing your chart."
              : e.message,
          );
          setLoading(false);
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timeout);
    };
  }, [id, interval, reload]);
  function change(next: Partial<ChartLayout["payload"]>) {
    requestKey.current = null;
    setSaveMessage("");
    setLayout((v) => ({ ...v, payload: { ...v.payload, ...next } }));
  }
  async function save() {
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
      setSaveMessage("Chart layout saved · version " + v.layout.version);
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
      const v = await json<{ asset: AssetResearch }>(
        "/api/x2/data?id=" +
          encodeURIComponent(peerId) +
          "&interval=" +
          interval,
      );
      setPeer(v.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      peerRef.current = false;
      setPeerBusy(false);
    }
  }
  const rows = useMemo(() => asset?.references ?? [], [asset]),
    end = Math.max(1, rows.length - offset),
    start = Math.max(0, end - windowSize),
    shown = rows.slice(start, end);
  const derivedAllowed = canShowDerived(asset);
  const data = useMemo(() => assetAnalytics(asset), [asset]);
  const comparison = useMemo(
    () =>
      derivedAllowed && canShowDerived(peer) && peer?.interval === interval
        ? normalizedComparison(rows, peer.references).slice(-200)
        : [],
    [rows, peer, interval, derivedAllowed],
  );
  const candleMap = new Map((asset?.candles ?? []).map((c) => [c.date, c]));
  const priceOverlays = layout.payload.indicators.filter(
    (k) => derivedAllowed && ["SMA20", "EMA20", "BB20"].includes(k),
  );
  const values = shown.flatMap((p) => {
    const c = candleMap.get(p.date);
    return c ? [c.low, c.high] : [p.close];
  });
  for (const k of priceOverlays) {
    const v = data[k as keyof typeof data]
      .slice(start, end)
      .filter((v): v is number => v !== null);
    values.push(...v);
    if (k === "BB20")
      values.push(
        ...data.BBUP.slice(start, end).filter((v): v is number => v !== null),
        ...data.BBLOW.slice(start, end).filter((v): v is number => v !== null),
      );
  }
  const low = values.length ? Math.min(...values) : 0,
    high = values.length ? Math.max(...values) : 1,
    pad = (high - low || Math.abs(high) * 0.01 || 1) * 0.1,
    min = low - pad,
    max = high + pad;
  const x = (i: number) =>
      56 +
      (shown.length > 1 ? i / (shown.length - 1) : 0.5) * (chartWidth - 90),
    y = (v: number) => 25 + ((max - v) / (max - min)) * 260;
  const path = (v: (number | null)[]) =>
    v
      .map((p, i) =>
        p === null
          ? ""
          : `${i === 0 || v[i - 1] === null ? "M" : "L"}${x(i).toFixed(2)},${y(p).toFixed(2)}`,
      )
      .join(" ");
  const point = shown[hover ?? shown.length - 1],
    currentCandle = point ? candleMap.get(point.date) : null;
  function addDrawing() {
    if (!derivedAllowed) {
      setError("Analysis and derived-display rights required.");
      return;
    }
    const value1 = Number(drawing.value1),
      value2 = Number(drawing.value2);
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
  return (
    <section ref={surface} className="x2-terminal" aria-busy={loading}>
      <header className="x2-terminal-head">
        <div>
          <h2>{asset?.name ?? id}</h2>
          <span>
            {id} · {asset?.state ?? "Loading"} ·{" "}
            {asset?.provider ?? "Source checking"}
          </span>
        </div>
        {onClose && (
          <button aria-label="Close asset research" onClick={onClose}>
            <X size={17} />
          </button>
        )}
      </header>
      <div className="x2-terminal-actions">
        <button
          onClick={() => onAnalyze?.("close > sma(close, 20)", id)}
          disabled={!onAnalyze}
        >
          Scan this asset
        </button>
        <button
          onClick={save}
          disabled={saving || loading || !asset}
          aria-busy={saving}
        >
          <Save size={15} />
          {saving ? "Saving…" : "Save layout"}
        </button>
        <details className="x2-inline-help">
          <summary aria-label="About this research terminal">
            <Info size={17} />
          </summary>
          <p>
            Source observations and theoretical calculations stay distinct.
            Charts never create permission to trade, redistribute data or claim
            predictive performance. Layouts and drawings are private to your
            account.
          </p>
        </details>
      </div>
      {saveMessage && <p role="status">{saveMessage}</p>}
      {error && (
        <p role="alert" className="x2-error">
          {error}{" "}
          <button onClick={() => setReload((n) => n + 1)}>Retry source</button>
        </p>
      )}
      <nav className="x2-research-tabs" aria-label="Asset research views">
        {[
          "Chart",
          "Technicals",
          "Fundamentals",
          "Statements",
          "Events",
          "Derivatives",
          "Compare",
          "Source",
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {loading && !asset ? (
        <p role="status">Loading permitted source observations…</p>
      ) : (
        <>
          {tab === "Chart" && (
            <>
              <div className="x2-chart-toolbar">
                <label>
                  View
                  <select
                    value={layout.payload.mode}
                    onChange={(e) =>
                      change({
                        mode: e.target.value as ChartLayout["payload"]["mode"],
                      })
                    }
                  >
                    <option value="line">Line</option>
                    <option
                      value="candles"
                      disabled={!asset?.capabilities.candles}
                    >
                      Candles · OHLC required
                    </option>
                    <option
                      value="ohlc"
                      disabled={!asset?.capabilities.candles}
                    >
                      OHLC · source required
                    </option>
                  </select>
                </label>
                <label>
                  Interval
                  <select
                    value={interval}
                    onChange={(e) => {
                      requestKey.current = null;
                      setInterval(e.target.value as Interval);
                      setOffset(0);
                    }}
                  >
                    <option value="1d">Daily</option>
                    <option value="1wk" disabled={!derivedAllowed}>
                      Weekly
                    </option>
                    <option value="1mo" disabled={!derivedAllowed}>
                      Monthly
                    </option>
                  </select>
                </label>
                <label>
                  Preset
                  <select
                    disabled={!derivedAllowed}
                    defaultValue="Basic"
                    onChange={(e) =>
                      change({
                        indicators:
                          e.target.value === "Basic"
                            ? []
                            : e.target.value === "Research"
                              ? ["SMA20", "RSI14"]
                              : [
                                  "SMA20",
                                  "EMA20",
                                  "BB20",
                                  "RSI14",
                                  "MACD",
                                  "DRAWDOWN",
                                ],
                      })
                    }
                  >
                    <option>Basic</option>
                    <option>Research</option>
                    <option>Advanced</option>
                  </select>
                </label>
              </div>
              {shown.length > 0 ? (
                <>
                  <p className="x2-source-line">
                    {asset?.unit} · source dates / UTC date axis ·{" "}
                    {shown[0].date} — {shown.at(-1)!.date}
                    {interval !== "1d" &&
                      " · Last available source observations; latest calendar group may be partial."}
                  </p>
                  <div className="x2-chart-controls">
                    <button
                      aria-label="Zoom in chart"
                      disabled={windowSize <= 20}
                      onClick={() => setWindowSize((n) => Math.max(20, n - 20))}
                    >
                      <ZoomIn size={16} />
                    </button>
                    <button
                      aria-label="Zoom out chart"
                      disabled={windowSize >= rows.length}
                      onClick={() =>
                        setWindowSize((n) => Math.min(rows.length, n + 20))
                      }
                    >
                      <ZoomOut size={16} />
                    </button>
                    <button
                      aria-label="Earlier chart observations"
                      disabled={start === 0}
                      onClick={() =>
                        setOffset((n) =>
                          Math.min(Math.max(0, rows.length - 20), n + 20),
                        )
                      }
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      aria-label="Later chart observations"
                      disabled={offset === 0}
                      onClick={() => setOffset((n) => Math.max(0, n - 20))}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <svg
                    viewBox={`0 0 ${chartWidth} 325`}
                    className="x2-price-chart"
                    role="img"
                    aria-label={
                      "Source " +
                      layout.payload.mode +
                      " chart. Tabular observations follow."
                    }
                    onPointerMove={(e) => {
                      const box = e.currentTarget.getBoundingClientRect();
                      setHover(
                        Math.max(
                          0,
                          Math.min(
                            shown.length - 1,
                            Math.round(
                              ((((e.clientX - box.left) / box.width) *
                                chartWidth -
                                56) /
                                (chartWidth - 90)) *
                                (shown.length - 1),
                            ),
                          ),
                        ),
                      );
                    }}
                    onPointerLeave={() => setHover(null)}
                  >
                    <defs>
                      <clipPath id={clipId}>
                        <rect
                          x="55"
                          y="20"
                          width={chartWidth - 82}
                          height="270"
                        />
                      </clipPath>
                    </defs>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <g key={i}>
                        <line
                          x1="56"
                          x2={chartWidth - 34}
                          y1={25 + i * 65}
                          y2={25 + i * 65}
                          className="x2-chart-grid"
                        />
                        <text x="2" y={29 + i * 65}>
                          {num(max - ((max - min) * i) / 4)}
                        </text>
                      </g>
                    ))}
                    <g clipPath={"url(#" + clipId + ")"}>
                      {layout.payload.mode === "line" ||
                      !asset?.capabilities.candles ? (
                        <path
                          d={path(shown.map((p) => p.close))}
                          className="x2-series"
                        />
                      ) : (
                        shown.map((p, i) => {
                          const c = candleMap.get(p.date);
                          return c ? (
                            <g key={p.date}>
                              <line
                                x1={x(i)}
                                x2={x(i)}
                                y1={y(c.high)}
                                y2={y(c.low)}
                                className="x2-series"
                              />
                              {layout.payload.mode === "candles" ? (
                                <rect
                                  x={
                                    x(i) -
                                    Math.max(
                                      1,
                                      ((chartWidth - 90) * 0.3) / shown.length,
                                    )
                                  }
                                  y={Math.min(y(c.open), y(c.close))}
                                  width={Math.max(
                                    2,
                                    ((chartWidth - 90) * 0.6) / shown.length,
                                  )}
                                  height={Math.max(
                                    1,
                                    Math.abs(y(c.open) - y(c.close)),
                                  )}
                                  className={
                                    c.close >= c.open
                                      ? "x2-candle-up"
                                      : "x2-candle-down"
                                  }
                                />
                              ) : (
                                <>
                                  <line
                                    x1={x(i) - 4}
                                    x2={x(i)}
                                    y1={y(c.open)}
                                    y2={y(c.open)}
                                    className="x2-series"
                                  />
                                  <line
                                    x1={x(i)}
                                    x2={x(i) + 4}
                                    y1={y(c.close)}
                                    y2={y(c.close)}
                                    className="x2-series"
                                  />
                                </>
                              )}
                            </g>
                          ) : null;
                        })
                      )}
                      {priceOverlays.map((k, i) => (
                        <path
                          key={k}
                          d={path(
                            data[k as keyof typeof data].slice(start, end),
                          )}
                          className="x2-series x2-indicator-line"
                          strokeDasharray={i % 2 ? "2 4" : "8 4"}
                        />
                      ))}
                      {derivedAllowed &&
                        layout.payload.indicators.includes("BB20") &&
                        ["BBUP", "BBLOW"].map((k) => (
                          <path
                            key={k}
                            d={path(
                              data[k as "BBUP" | "BBLOW"].slice(start, end),
                            )}
                            className="x2-series x2-indicator-line"
                            strokeDasharray="3 5"
                          />
                        ))}
                      {derivedAllowed &&
                        layout.payload.drawings.map((d) => {
                          const a = shown.findIndex((p) => p.date === d.date1),
                            b = shown.findIndex((p) => p.date === d.date2);
                          if (a < 0) return null;
                          if (d.type === "level")
                            return (
                              <line
                                key={d.id}
                                x1="56"
                                x2={chartWidth - 34}
                                y1={y(d.value1)}
                                y2={y(d.value1)}
                                className="x2-drawing-line"
                              />
                            );
                          if (b < 0 || d.value2 === undefined) return null;
                          if (d.type === "fibonacci")
                            return (
                              <g key={d.id}>
                                {[0, 0.236, 0.382, 0.5, 0.618, 1].map((r) => (
                                  <g key={r}>
                                    <line
                                      x1={Math.min(x(a), x(b))}
                                      x2={chartWidth - 34}
                                      y1={y(
                                        d.value1 + (d.value2! - d.value1) * r,
                                      )}
                                      y2={y(
                                        d.value1 + (d.value2! - d.value1) * r,
                                      )}
                                      className="x2-drawing-line"
                                    />
                                    <text
                                      x={Math.min(x(a), x(b)) + 4}
                                      y={
                                        y(
                                          d.value1 + (d.value2! - d.value1) * r,
                                        ) - 3
                                      }
                                    >
                                      {r * 100}%
                                    </text>
                                  </g>
                                ))}
                              </g>
                            );
                          const endpoint =
                              d.type === "ray" && a !== b
                                ? chartWidth - 34
                                : x(b),
                            last =
                              d.type === "ray" && a !== b
                                ? y(d.value1) +
                                  ((y(d.value2) - y(d.value1)) *
                                    (chartWidth - 34 - x(a))) /
                                    (x(b) - x(a))
                                : y(d.value2);
                          return (
                            <line
                              key={d.id}
                              x1={x(a)}
                              y1={y(d.value1)}
                              x2={endpoint}
                              y2={last}
                              className="x2-drawing-line"
                            />
                          );
                        })}
                      {point && hover !== null && (
                        <>
                          <line
                            x1={x(hover)}
                            x2={x(hover)}
                            y1="20"
                            y2="290"
                            className="x2-crosshair"
                          />
                          <line
                            x1="56"
                            x2={chartWidth - 34}
                            y1={y(point.close)}
                            y2={y(point.close)}
                            className="x2-crosshair"
                          />
                        </>
                      )}
                    </g>
                    <text x="56" y="313">
                      {shown[0].date}
                    </text>
                    <text x={chartWidth - 34} y="313" textAnchor="end">
                      {shown.at(-1)!.date}
                    </text>
                  </svg>
                  <p className="x2-chart-readout">
                    {point?.date} · Reference / close {num(point?.close)}
                    {currentCandle
                      ? ` · O ${num(currentCandle.open)} H ${num(currentCandle.high)} L ${num(currentCandle.low)} V ${num(currentCandle.volume)}`
                      : ""}
                  </p>
                  <p className="x2-source-line">
                    Solid: observed price. Dashed:{" "}
                    {priceOverlays.join(", ") || "no overlays"}. Hollow candles:
                    close ≥ open; filled: close &lt; open.
                  </p>
                  {asset?.capabilities.volume && (
                    <div className="x2-indicator-panel">
                      <strong>
                        Source volume ·{" "}
                        {asset.instrument?.type === "FUTURE"
                          ? "contracts / provider units"
                          : "provider units"}{" "}
                        · no depth profile
                      </strong>
                      <svg
                        viewBox={`0 0 ${chartWidth} 90`}
                        role="img"
                        aria-label="Actual source volume by displayed trading date"
                      >
                        {shown.map((p, i) => {
                          const volume = candleMap.get(p.date)?.volume,
                            maxVolume = Math.max(
                              1,
                              ...shown.map(
                                (d) => candleMap.get(d.date)?.volume ?? 0,
                              ),
                            );
                          return volume == null ? null : (
                            <rect
                              key={p.date}
                              x={x(i) - 2}
                              y={80 - (volume / maxVolume) * 70}
                              width={Math.max(
                                1,
                                ((chartWidth - 90) / shown.length) * 0.6,
                              )}
                              height={(volume / maxVolume) * 70}
                              className="x2-volume-bar"
                            />
                          );
                        })}
                      </svg>
                    </div>
                  )}
                  {!derivedAllowed && (
                    <p>
                      Display-only source: derived indicators, presets,
                      aggregated intervals and comparisons are not permitted.
                    </p>
                  )}
                  <fieldset className="x2-indicator-picker">
                    <legend>Indicators</legend>
                    {[
                      "SMA20",
                      "EMA20",
                      "RSI14",
                      "MACD",
                      "BB20",
                      "ATR14",
                      "DRAWDOWN",
                    ].map((k) => (
                      <label key={k}>
                        <input
                          type="checkbox"
                          checked={layout.payload.indicators.includes(k)}
                          disabled={
                            !derivedAllowed ||
                            (k === "ATR14" && !asset?.capabilities.candles)
                          }
                          onChange={(e) =>
                            change({
                              indicators: e.target.checked
                                ? [...layout.payload.indicators, k]
                                : layout.payload.indicators.filter(
                                    (x) => x !== k,
                                  ),
                            })
                          }
                        />
                        {k}
                      </label>
                    ))}
                  </fieldset>
                  {layout.payload.indicators
                    .filter(
                      (k) =>
                        derivedAllowed &&
                        ["RSI14", "MACD", "ATR14", "DRAWDOWN"].includes(k),
                    )
                    .map((k) => {
                      const vals = data[k as keyof typeof data].slice(
                          start,
                          end,
                        ),
                        finite = vals.filter((v): v is number => v !== null),
                        lo = finite.length ? Math.min(...finite) : 0,
                        hi = finite.length ? Math.max(...finite) : 1,
                        py = (v: number) =>
                          8 + ((hi - v) / (hi - lo || 1)) * 70;
                      return (
                        <div className="x2-indicator-panel" key={k}>
                          <strong>
                            {k} · {num(vals.at(-1))}
                            {k === "RSI14" || k === "DRAWDOWN" ? " %" : ""}
                          </strong>
                          {finite.length ? (
                            <svg
                              viewBox={`0 0 ${chartWidth} 90`}
                              role="img"
                              aria-label={
                                k + " chronological source-derived values"
                              }
                            >
                              <path
                                d={vals
                                  .map((v, i) =>
                                    v === null
                                      ? ""
                                      : `${i === 0 || vals[i - 1] === null ? "M" : "L"}${x(i)},${py(v)}`,
                                  )
                                  .join(" ")}
                                className="x2-series"
                              />
                            </svg>
                          ) : (
                            <p>Insufficient warmup observations.</p>
                          )}
                        </div>
                      );
                    })}
                  <details>
                    <summary>Price/date drawing tools</summary>
                    <fieldset disabled={!derivedAllowed}>
                      <legend>
                        Requires analysis and derived-display rights
                      </legend>
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
                              setDrawing((v) => ({
                                ...v,
                                date1: e.target.value,
                              }))
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
                              setDrawing((v) => ({
                                ...v,
                                value1: e.target.value,
                              }))
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
                                  setDrawing((v) => ({
                                    ...v,
                                    date2: e.target.value,
                                  }))
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
                                  setDrawing((v) => ({
                                    ...v,
                                    value2: e.target.value,
                                  }))
                                }
                              />
                            </label>
                          </>
                        )}
                        <button onClick={addDrawing}>Add drawing</button>
                        <button
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
                    {layout.payload.drawings.map((d) => (
                      <p key={d.id}>
                        {d.type} · {d.date1} · {num(d.value1)}{" "}
                        <button
                          onClick={() =>
                            change({
                              drawings: layout.payload.drawings.filter(
                                (x) => x.id !== d.id,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </p>
                    ))}
                  </details>
                  <details>
                    <summary>
                      Accessible source table · {shown.length} observations
                    </summary>
                    <div className="x2-table-scroll">
                      <table>
                        <caption>
                          {asset?.provider} · {asset?.unit}
                        </caption>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Reference / close</th>
                            <th>Open</th>
                            <th>High</th>
                            <th>Low</th>
                            <th>Volume</th>
                            <th>Known at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((p) => {
                            const c = candleMap.get(p.date);
                            return (
                              <tr key={p.date}>
                                <td>{p.date}</td>
                                <td>{num(p.close)}</td>
                                <td>{num(c?.open)}</td>
                                <td>{num(c?.high)}</td>
                                <td>{num(c?.low)}</td>
                                <td>{num(c?.volume)}</td>
                                <td>{p.knownAt}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <p className="x2-empty">
                  No licensed observations. Connect the relevant dataset; no
                  chart is fabricated.
                </p>
              )}
            </>
          )}
          {tab === "Technicals" && !derivedAllowed && (
            <p>
              Analysis and derived-display rights are required. Raw observations
              remain available in Chart.
            </p>
          )}
          {tab === "Technicals" && derivedAllowed && (
            <>
              <p>
                Calculated from {rows.length} {interval} observations. Warmup
                values remain unavailable. VWAP requires session-aware intraday
                volume and is unavailable on daily references.
              </p>
              <div className="x2-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Metric / lookback</th>
                      <th>Latest value</th>
                      <th>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data)
                      .filter(([k]) => !["BBUP", "BBLOW"].includes(k))
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{num(v.at(-1))}</td>
                          <td>
                            {k === "RSI14" || k === "DRAWDOWN"
                              ? "%"
                              : asset?.unit}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "Fundamentals" &&
            (asset?.fundamentals.length ? (
              <div className="x2-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                      <th>Period</th>
                      <th>Filing known at</th>
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
                        <td>{f.knownAt ?? "Unknown — no PIT use"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No licensed company fundamentals. Company statements do not
                apply to FX, yields, indices or commodity futures.
              </p>
            ))}
          {tab === "Statements" &&
            (asset?.statements.length ? (
              asset.statements.map((s) => (
                <details key={s.kind + s.period}>
                  <summary>
                    {s.kind} · {s.period} · {s.currency}
                  </summary>
                  <p>
                    {s.basis} · filing {s.knownAt ?? "Unavailable"}
                  </p>
                  <div className="x2-table-scroll">
                    <table>
                      <tbody>
                        {Object.entries(s.values).map(([k, v]) => (
                          <tr key={k}>
                            <th>{k}</th>
                            <td>{num(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))
            ) : (
              <p>
                Income, balance-sheet and cash-flow data are unavailable.
                Period/basis/filing lineage will accompany an entitled source.
              </p>
            ))}
          {tab === "Events" &&
            (asset?.events.length ? (
              asset.events.map((e) => (
                <article key={e.sourceUrl + e.date}>
                  <span>
                    {e.date} · {e.type}
                  </span>
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
              <p>
                No entitled event/news feed for this instrument. No earnings
                date or event is guessed.
              </p>
            ))}
          {tab === "Derivatives" && (
            <>
              <p>
                {asset?.instrument?.type === "FUTURE"
                  ? `Contract expiry ${asset.instrument.expiry}; lot ${asset.instrument.lotSize}; tick ${asset.instrument.tickSize}; ${asset.instrument.unit}.`
                  : "Select an exact entitled derivative contract to inspect its expiry, lot, tick and unit."}
              </p>
              <p>
                Option chains, skew and provider Greeks are not connected by the
                implemented history adapters. Formula Lab remains available for
                theoretical BSM/Greeks/IV and user-assumed payoffs; theoretical
                values are not executable quotes.
              </p>
            </>
          )}
          {tab === "Compare" && (
            <>
              <label>
                Peer / benchmark
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
                onClick={compare}
                disabled={peerBusy || !derivedAllowed}
                aria-busy={peerBusy}
              >
                {peerBusy ? "Loading comparison…" : "Compare sources"}
              </button>
              {peer && (
                <>
                  <h3>{peer.name}</h3>
                  <p>
                    {peer.state} · {peer.provider} · {peer.references.length}{" "}
                    observations
                  </p>
                  {comparison.length > 1 && (
                    <div className="x2-indicator-panel">
                      <strong>
                        Same-date price context · rebased to 100 ·{" "}
                        {comparison.length} observations
                      </strong>
                      <p>
                        Solid: {asset?.name} ({asset?.currency}). Dashed:{" "}
                        {peer.name} ({peer.currency}). No FX conversion or
                        total-return adjustment is implied.
                      </p>
                      <svg
                        viewBox={`0 0 ${chartWidth} 180`}
                        role="img"
                        aria-label="Matched-date normalized instrument and peer price comparison"
                      >
                        {(["left", "right"] as const).map((key, index) => {
                          const lo = Math.min(
                              ...comparison.flatMap((p) => [p.left, p.right]),
                            ),
                            hi = Math.max(
                              ...comparison.flatMap((p) => [p.left, p.right]),
                            );
                          return (
                            <path
                              key={key}
                              d={comparison
                                .map(
                                  (p, i) =>
                                    `${i ? "L" : "M"}${25 + (i / (comparison.length - 1)) * (chartWidth - 50)},${10 + ((hi - p[key]) / (hi - lo || 1)) * 150}`,
                                )
                                .join(" ")}
                              className="x2-series"
                              strokeDasharray={index ? "6 4" : undefined}
                            />
                          );
                        })}
                      </svg>
                      <p>
                        {comparison[0].date} — {comparison.at(-1)!.date}
                      </p>
                    </div>
                  )}
                  <div className="x2-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Selected</th>
                          <th>Peer</th>
                          <th>Comparability</th>
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
                  {!peer.fundamentals.length && (
                    <p>
                      No comparable licensed financial metrics. Missing data is
                      not a zero valuation.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {tab === "Source" && (
            <>
              <dl>
                <dt>Source</dt>
                <dd>{asset?.provider}</dd>
                <dt>Retrieved</dt>
                <dd>{asset?.retrievedAt ?? "Unavailable"}</dd>
                <dt>State</dt>
                <dd>{asset?.state}</dd>
                <dt>Version</dt>
                <dd>{asset?.schemaVersion}</dd>
                <dt>Point-in-time vintage</dt>
                <dd>Unavailable — historical probability/backtests gated</dd>
                <dt>Analysis / retention</dt>
                <dd>
                  {asset?.capabilities.analysis ? "Permitted" : "Not entitled"}{" "}
                  / {asset?.capabilities.storage ? "Permitted" : "Not entitled"}
                </dd>
              </dl>
              {asset?.sourceUrl && (
                <a
                  href={asset.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Official source / documentation
                </a>
              )}
              <ul>
                {asset?.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
