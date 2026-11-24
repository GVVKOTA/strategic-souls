"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkPlus,
  Eraser,
  Info,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  PATTERN_TEMPLATES,
  validateStrokePoints,
  type DrawMatchResult,
  type DrawPoint,
  type DrawScanReport,
  type PatternTemplate,
} from "../../../backend/engines/pattern-draw";
import type { SoulGenomeReport } from "../../../backend/engines/soul-genome";
import {
  SCAN_REQUEST_VERSION,
  type ScanUniversePreset,
} from "../../../backend/services/research/research";
import {
  api,
  type Notice,
  type SavedPatternRecord,
} from "../../components/workspace/shared";
import { triggerGoFeedback } from "../../components/workspace/go-feedback";

type Props = {
  authenticated: boolean;
  onRequireAuth?: () => void;
  scanName?: string;
  onRequireName?: (message: string) => void;
  universe: "ECB_DAILY" | "CONNECTED_MARKETS";
  universePreset?: ScanUniversePreset;
  watchlistId?: string;
  interval: "30m" | "1h" | "1d" | "1wk" | "1mo";
  customCsv?: string;
  instrumentIds?: string[];
  savedPatterns?: SavedPatternRecord[];
  onPatternSaved?: () => Promise<void> | void;
  busy: boolean;
  onScanComplete: (res: {
    id: string;
    drawReport: DrawScanReport;
    soulGenome?: SoulGenomeReport;
  }) => Promise<void> | void;
  onOpenAsset: (id: string) => void;
  notify: Notice;
};

const FEATURED_TEMPLATE_IDS = new Set([
  "double_bottom",
  "ascending_triangle",
  "resistance_breakout",
]);

function TemplateThumbnail({
  points,
  active,
}: {
  points: readonly DrawPoint[];
  active: boolean;
}) {
  if (points.length < 2) return null;
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(6 + p.x * 68).toFixed(1)},${(34 - p.y * 28).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 80 40"
      className="ss-v31-tpl-svg ss-v3-colored-svg"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={active ? "#79BFBD" : "#4FA3A1"}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NormalizedOverlaySvg({ match }: { match: DrawMatchResult }) {
  const q = match.normalizedQuery;
  const s = match.normalizedSeries;
  if (q.length < 2 || s.length < 2) return null;
  const all = [...q, ...s];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const toPath = (arr: number[]) =>
    arr
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"}${((i / (arr.length - 1)) * 220).toFixed(1)},${(58 - ((v - min) / span) * 48).toFixed(1)}`,
      )
      .join(" ");
  const seriesDelta = s[s.length - 1] - s[0];
  const seriesStroke =
    seriesDelta > 1e-6 ? "#42CF91" : seriesDelta < -1e-6 ? "#EF666A" : "#929CA7";

  return (
    <svg
      viewBox="0 0 220 64"
      className="ss-v3-colored-svg"
      style={{ width: "100%", height: 64, display: "block" }}
      role="img"
      aria-label={`Overlay comparing your pattern and ${match.instrumentId}`}
    >
      <path
        d={toPath(q)}
        fill="none"
        stroke="#4FA3A1"
        strokeWidth="1.7"
        strokeDasharray="4 3"
      />
      <path
        d={toPath(s)}
        fill="none"
        stroke={seriesStroke}
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * Strategic Souls V3.1 — Pattern Scan Canvas.
 * Single continuous chronological trajectory with full Undo stack across Draw/Erase/Clear/Reset/Template,
 * single-pointer isolation (ignores second finger / pinch), ResizeObserver preservation,
 * fullscreen drawing mode, flat-pattern rejection, and account-private saved patterns.
 */
export default function PatternDrawCanvas({
  authenticated,
  onRequireAuth,
  scanName: controlledName,
  onRequireName,
  universe,
  interval,
  customCsv,
  instrumentIds,
  universePreset,
  watchlistId,
  savedPatterns = [],
  onPatternSaved,
  busy,
  onScanComplete,
  onOpenAsset,
  notify,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localNameRef = useRef<HTMLInputElement>(null);
  const activePointerId = useRef<number | null>(null);
  const preStrokeSnapshot = useRef<DrawPoint[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [points, setPoints] = useState<DrawPoint[]>([
    ...PATTERN_TEMPLATES[0].points,
  ]);
  const [history, setHistory] = useState<DrawPoint[][]>([]);
  const [activeTemplate, setActiveTemplate] = useState<string>(
    PATTERN_TEMPLATES[0].id,
  );
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [localName, setLocalName] = useState("");
  const [localNameError, setLocalNameError] = useState("");
  const [shapeError, setShapeError] = useState("");
  const [windowBars, setWindowBars] = useState(20);
  const [minPatternFit, setMinPatternFit] = useState(75);
  const [submitting, setSubmitting] = useState(false);
  const [savingPattern, setSavingPattern] = useState(false);
  const [lastReport, setLastReport] = useState<DrawScanReport | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const isControlledName = controlledName !== undefined;
  const effectiveName = isControlledName ? controlledName : localName;

  const visibleTemplates: readonly PatternTemplate[] = useMemo(
    () =>
      showAllTemplates
        ? PATTERN_TEMPLATES
        : PATTERN_TEMPLATES.filter((t) => FEATURED_TEMPLATE_IDS.has(t.id)),
    [showAllTemplates],
  );

  const pushHistory = useCallback((snapshot: DrawPoint[]) => {
    setHistory((prev) => [...prev.slice(-24), snapshot]);
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(220, canvas.clientWidth || 440);
    const h = Math.max(180, canvas.clientHeight || 220);
    if (
      canvas.width !== Math.floor(w * dpr) ||
      canvas.height !== Math.floor(h * dpr)
    ) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Subtle calibration grid
    ctx.strokeStyle = "rgba(146, 156, 167, 0.11)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const x = (w * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    if (points.length === 0) {
      ctx.fillStyle = "rgba(197, 205, 213, 0.55)";
      ctx.font = '13px "Inter", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("Draw left to right, or choose a template above", w / 2, h / 2);
      return;
    }

    const padX = 16;
    const padY = 16;
    const toX = (nx: number) => padX + nx * (w - padX * 2);
    const toY = (ny: number) => padY + (1 - ny) * (h - padY * 2);

    if (points.length >= 2) {
      // Soft teal area glow beneath trajectory
      const grad = ctx.createLinearGradient(0, padY, 0, h - padY);
      grad.addColorStop(0, "rgba(79, 163, 161, 0.22)");
      grad.addColorStop(1, "rgba(79, 163, 161, 0)");
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const px = toX(pt.x);
        const py = toY(pt.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.lineTo(toX(points[points.length - 1].x), h - padY);
      ctx.lineTo(toX(points[0].x), h - padY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Primary Strategic Teal trajectory
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const px = toX(pt.x);
        const py = toY(pt.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = "#4FA3A1";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // Crisp start & end endpoints
    const endpoints =
      points.length >= 2 ? [points[0], points[points.length - 1]] : [points[0]];
    for (const endPt of endpoints) {
      ctx.beginPath();
      ctx.arc(toX(endPt.x), toY(endPt.y), 4.2, 0, Math.PI * 2);
      ctx.fillStyle = "#79BFBD";
      ctx.fill();
      ctx.strokeStyle = "#090B0D";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [points]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, fullscreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof ResizeObserver !== "undefined") {
      const obs = new ResizeObserver(() => renderCanvas());
      obs.observe(canvas);
      return () => obs.disconnect();
    }
    const onResize = () => renderCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderCanvas, fullscreen]);

  function pointerToPoint(e: React.PointerEvent<HTMLCanvasElement>): DrawPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - 16) / Math.max(1, rect.width - 32)),
    );
    const y = Math.max(
      0,
      Math.min(1, 1 - (e.clientY - rect.top - 16) / Math.max(1, rect.height - 32)),
    );
    return { x, y };
  }

  function eraseNear(pt: DrawPoint, current: DrawPoint[]): DrawPoint[] {
    // Split into contiguous segments outside the erase radius and keep the longest valid trajectory
    // so erased gaps NEVER create an accidental auto-bridged line across empty space.
    const segments: DrawPoint[][] = [];
    let chunk: DrawPoint[] = [];
    for (const p of current) {
      if (Math.hypot(p.x - pt.x, p.y - pt.y) > 0.085) {
        chunk.push(p);
      } else if (chunk.length > 0) {
        segments.push(chunk);
        chunk = [];
      }
    }
    if (chunk.length > 0) segments.push(chunk);
    const valid = segments.filter((seg) => seg.length >= 2);
    if (valid.length === 0) return [];
    valid.sort((a, b) => b.length - a.length);
    return valid[0];
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // Ignore secondary touches (e.g. accidental palm or second finger) while an active stroke is in progress
    if (activePointerId.current !== null && activePointerId.current !== e.pointerId) {
      return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Fallback gracefully if capture is unavailable */
    }
    activePointerId.current = e.pointerId;
    setShapeError("");
    const pt = pointerToPoint(e);

    if (eraseMode) {
      pushHistory(points);
      setPoints((prev) => eraseNear(pt, prev));
      setActiveTemplate("");
      return;
    }

    // Starting a new trajectory replaces any prior shape cleanly (never auto-bridges disconnected strokes!)
    // while keeping the previous shape one tap away in Undo history.
    preStrokeSnapshot.current = points;
    setActiveTemplate("");
    setPoints([pt]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerId.current !== e.pointerId) return;
    e.preventDefault();
    const pt = pointerToPoint(e);

    if (eraseMode) {
      setPoints((prev) => eraseNear(pt, prev));
      return;
    }

    setPoints((prev) => {
      if (prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      if (Math.hypot(last.x - pt.x, last.y - pt.y) < 0.014) return prev;
      // Keep trajectory monotonic left-to-right to avoid self-crossing tangles
      const nextX = Math.max(last.x + 0.002, pt.x);
      if (nextX > 1) return prev;
      return [...prev, { x: nextX, y: pt.y }].slice(0, 240);
    });
  }

  function finishPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerId.current !== e.pointerId) return;
    activePointerId.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* Ignore release errors */
    }
    if (!eraseMode) {
      const prior = preStrokeSnapshot.current;
      preStrokeSnapshot.current = null;
      setPoints((curr) => {
        // Ignore accidental single tap / tiny accidental isolated mark by restoring previous valid shape
        if (curr.length < 2 && prior && prior.length >= 2) {
          return prior;
        }
        if (prior && prior.length >= 2) {
          pushHistory(prior);
        }
        return curr;
      });
    }
  }

  function applyTemplate(templateId: string, pts: readonly DrawPoint[]) {
    if (points.length > 0) pushHistory(points);
    setActiveTemplate(templateId);
    setEraseMode(false);
    setShapeError("");
    setPoints([...pts]);
  }

  function handleUndo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setPoints(previous);
      setActiveTemplate("");
      setShapeError("");
      return prev.slice(0, -1);
    });
  }

  function handleClear() {
    if (points.length > 0) pushHistory(points);
    setPoints([]);
    setActiveTemplate("");
    setEraseMode(false);
    setShapeError("");
  }

  function handleReset() {
    applyTemplate(PATTERN_TEMPLATES[0].id, PATTERN_TEMPLATES[0].points);
  }

  async function saveCustomPattern() {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      validateStrokePoints(points);
    } catch (err) {
      setShapeError((err as Error).message);
      return;
    }
    if (savingPattern) return;
    const cleanName =
      effectiveName.trim().slice(0, 56) ||
      `Custom Pattern ${new Date().toISOString().slice(5, 10)}`;
    setSavingPattern(true);
    setShapeError("");
    try {
      await api("/api/x1/workspace", {
        action: "save-pattern",
        name: cleanName,
        strokePoints: points.slice(0, 240),
        windowBars,
        minPatternFit,
        requestId: crypto.randomUUID(),
      });
      await onPatternSaved?.();
      triggerGoFeedback("Pattern saved", `pattern-${crypto.randomUUID()}`, true);
      notify("Pattern saved privately to your account.");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not save pattern.",
        true,
      );
    } finally {
      setSavingPattern(false);
    }
  }

  async function runDrawScan() {
    setShapeError("");
    const trimmedName = effectiveName.trim() || "Pattern Scan";
    if ([...trimmedName].length < 3) {
      const msg = "Soul names must be 3–100 characters long.";
      if (onRequireName) {
        onRequireName(msg);
      } else {
        setLocalNameError(msg);
        localNameRef.current?.focus();
      }
      return;
    }
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      validateStrokePoints(points);
    } catch (err) {
      setShapeError((err as Error).message);
      return;
    }
    if (submitting || busy) return;
    if (!universePreset) {
      notify("Choose a market for this scan.", true);
      return;
    }
    const input = {
      action: "run-draw-scan",
      scanRequestVersion: SCAN_REQUEST_VERSION,
      name: trimmedName,
      description: `Pattern similarity search (${windowBars}-bar lookback, min fit ${minPatternFit}%).`,
      strokePoints: points.slice(0, 240),
      windowBars,
      minPatternFit,
      universe,
      universePreset,
      watchlistId,
      interval,
      ...(customCsv?.trim() ? { customCsv } : {}),
      ...(instrumentIds?.length ? { instrumentIds } : {}),
    };
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) {
      request.current = { signature, id: crypto.randomUUID() };
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSubmitting(true);
    try {
      const res = await api<{
        id: string;
        drawReport: DrawScanReport;
        soulGenome?: SoulGenomeReport;
      }>(
        "/api/strategy/scan",
        {
          ...input,
          requestId: request.current.id,
        },
        { signal: ctrl.signal },
      );
      if (!mounted.current) return;
      setLastReport(res.drawReport ?? null);
      await onScanComplete(res);
      request.current = null;
      if (mounted.current) notify("Pattern scan saved to GRAVEYARD.");
    } catch (err) {
      if (!mounted.current) return;
      notify(
        err instanceof Error ? err.message : "Pattern scan could not complete.",
        true,
      );
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div className="x51-draw-stage ss-v31-pattern-stage">
      <div className="ss-v31-pattern-head">
        <div>
          <h3 className="ss-v31-pattern-title">Pattern Scan</h3>
          <p className="ss-v31-pattern-sub">
            Draw a pattern. Find similar historical market movements.
          </p>
        </div>
        <button
          type="button"
          className="ss-v3-pin-btn"
          aria-label="Pattern Scan methodology"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </div>

      {infoOpen && (
        <div className="x56-formula-drawer" role="note">
          <p style={{ margin: 0, fontSize: "0.84rem" }}>
            Scores geometric similarity (0–100) using Z-normalized Pearson
            correlation and bounded Sakoe-Chiba DTW strictly on completed
            historical bars. Similarity describes past shape alignment only —
            never a forecast or probability of future gains.
          </p>
        </div>
      )}

      {/* Visual Pattern Templates (3 featured + View all 8) */}
      <div className="ss-v31-tpl-section">
        <div className="ss-v31-tpl-header">
          <span className="x54-field-label" style={{ margin: 0 }}>
            Templates
          </span>
          <button
            type="button"
            className="x1-text-button"
            style={{ padding: "4px 6px", fontSize: "0.82rem" }}
            onClick={() => setShowAllTemplates((v) => !v)}
          >
            {showAllTemplates
              ? "Show fewer"
              : `View all (${PATTERN_TEMPLATES.length})`}
          </button>
        </div>
        <div
          className="ss-v31-tpl-grid"
          role="group"
          aria-label="Pattern templates"
        >
          {visibleTemplates.map((tpl) => {
            const active = activeTemplate === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                className={"ss-v31-tpl-card" + (active ? " is-active" : "")}
                aria-pressed={active}
                onClick={() => applyTemplate(tpl.id, tpl.points)}
                title={tpl.description}
              >
                <TemplateThumbnail points={tpl.points} active={active} />
                <span className="ss-v31-tpl-label">{tpl.label}</span>
              </button>
            );
          })}
        </div>
        {savedPatterns.length > 0 && (
          <div className="ss-v31-saved-patterns">
            <span className="x1-caption">Your saved patterns</span>
            <div className="x51-chip-row">
              {savedPatterns.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  className={
                    "x51-chip" +
                    (activeTemplate === `saved:${sp.id}` ? " is-active" : "")
                  }
                  onClick={() => {
                    applyTemplate(`saved:${sp.id}`, sp.payload.points);
                    if (sp.payload.windowBars) setWindowBars(sp.payload.windowBars);
                    if (sp.payload.minPatternFit) {
                      setMinPatternFit(sp.payload.minPatternFit);
                    }
                  }}
                >
                  {sp.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Canvas Container (inline or fullscreen modal surface) */}
      <div
        className={
          "ss-v31-canvas-shell" + (fullscreen ? " is-fullscreen" : "")
        }
        role={fullscreen ? "dialog" : undefined}
        aria-modal={fullscreen ? "true" : undefined}
        aria-label={fullscreen ? "Fullscreen pattern drawing canvas" : undefined}
      >
        <div className="ss-v31-canvas-toolbar">
          <div className="ss-v31-canvas-tools">
            <button
              type="button"
              className="ss-v31-tool-btn"
              disabled={history.length === 0}
              onClick={handleUndo}
              title="Undo"
            >
              <Undo2 size={14} aria-hidden="true" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className={
                "ss-v31-tool-btn" + (eraseMode ? " is-teal-active" : "")
              }
              aria-pressed={eraseMode}
              onClick={() => setEraseMode((v) => !v)}
            >
              <Eraser size={14} aria-hidden="true" />
              <span>{eraseMode ? "Erasing" : "Erase"}</span>
            </button>
            <button
              type="button"
              className="ss-v31-tool-btn"
              disabled={points.length === 0}
              onClick={handleClear}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="ss-v31-tool-btn"
              onClick={handleReset}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
          <div className="ss-v31-canvas-tools">
            <button
              type="button"
              className="ss-v31-tool-btn"
              disabled={savingPattern || points.length < 2}
              onClick={() => void saveCustomPattern()}
              title="Save pattern privately"
            >
              <BookmarkPlus size={14} aria-hidden="true" />
              <span>{savingPattern ? "Saving…" : "Save"}</span>
            </button>
            <button
              type="button"
              className="ss-v31-tool-btn"
              aria-label={fullscreen ? "Exit fullscreen drawing" : "Expand drawing canvas"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? (
                <>
                  <Minimize2 size={14} aria-hidden="true" />
                  <span>Done</span>
                </>
              ) : (
                <Maximize2 size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className={
            "x51-draw-canvas ss-v31-draw-canvas" +
            (fullscreen ? " is-fullscreen" : "")
          }
          aria-label="Draw price trajectory left to right"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onLostPointerCapture={finishPointer}
        />
      </div>

      {shapeError && (
        <p className="x54-inline-error" role="alert" style={{ margin: 0 }}>
          {shapeError}
        </p>
      )}

      {!isControlledName && (
        <label className="x54-field-group">
          <span className="x54-field-label">Soul name</span>
          <input
            ref={localNameRef}
            id="ss-v31-pattern-local-name"
            name="patternScanName"
            className="x54-name-input"
            value={localName}
            maxLength={100}
            aria-invalid={localNameError ? "true" : undefined}
            onChange={(e) => {
              setLocalName(e.target.value);
              if (localNameError) setLocalNameError("");
            }}
            placeholder="Name your pattern scan"
          />
          {localNameError && (
            <span role="alert" className="x1-form-error">
              {localNameError}
            </span>
          )}
        </label>
      )}

      {/* Single clean Similarity slider */}
      <label className="ss-v31-slider-row" htmlFor="ss-v31-similarity-slider">
        <span className="ss-v31-slider-head">
          <span>Similarity</span>
          <strong className="ss-v31-slider-val">{minPatternFit}%</strong>
        </span>
        <input
          id="ss-v31-similarity-slider"
          name="minPatternFit"
          type="range"
          min={45}
          max={95}
          step={1}
          value={minPatternFit}
          onChange={(e) => setMinPatternFit(Number(e.target.value))}
        />
      </label>

      {/* Advanced settings disclosure (Lookback tucked neatly away) */}
      <details className="ss-v31-adv-disclosure">
        <summary>Advanced settings · {windowBars}-bar lookback</summary>
        <label
          className="ss-v31-slider-row"
          htmlFor="ss-v31-lookback-slider"
          style={{ marginTop: 10 }}
        >
          <span className="ss-v31-slider-head">
            <span>Lookback window</span>
            <strong className="ss-v31-slider-val">{windowBars} bars</strong>
          </span>
          <input
            id="ss-v31-lookback-slider"
            name="windowBars"
            type="range"
            min={10}
            max={60}
            step={2}
            value={windowBars}
            onChange={(e) => setWindowBars(Number(e.target.value))}
          />
        </label>
      </details>

      {/* Primary Blue CTA */}
      <button
        type="button"
        className="ss-v3-run-cta"
        disabled={submitting || busy || points.length < 2}
        aria-busy={submitting}
        onClick={() => void runDrawScan()}
      >
        <Search size={17} aria-hidden="true" />
        <span>
          {submitting ? "Searching similar patterns…" : "Find Similar Patterns"}
        </span>
      </button>

      {lastReport && (
        <div className="ss-v31-pattern-results">
          <div className="x1-caption">
            <strong>
              {lastReport.matches.length} match
              {lastReport.matches.length === 1 ? "" : "es"}
            </strong>{" "}
            across {lastReport.evaluated} evaluated instruments ·{" "}
            {lastReport.windowBars}-bar trailing window
          </div>
          {lastReport.matches.length > 0 ? (
            <div className="x51-genome-grid">
              {lastReport.matches.map((m) => (
                <div key={m.instrumentId} className="x51-genome-card">
                  <div className="ss-v31-pattern-match-head">
                    <button
                      type="button"
                      className="x1-text-button"
                      style={{ padding: 0 }}
                      onClick={() => onOpenAsset(m.instrumentId)}
                    >
                      <strong>{m.instrumentId}</strong>
                    </button>
                    <span className="ss-v31-teal-pill">
                      Fit {Math.round(m.patternFit)}%
                    </span>
                  </div>
                  <NormalizedOverlaySvg match={m} />
                  <p className="x1-caption" style={{ margin: 0 }}>
                    {m.windowStartAt.slice(0, 10)} → {m.windowEndAt.slice(0, 10)} ·{" "}
                    r={m.correlation.toFixed(2)}
                  </p>
                  <p className="x1-caption" style={{ margin: 0 }}>
                    Dashed teal: your drawing · Solid: observed closes
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="x1-callout">
              No eligible instruments reached {lastReport.minPatternFit}%
              similarity on the latest {lastReport.windowBars} closed bars.
              Lower the Similarity slider or try another template.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
