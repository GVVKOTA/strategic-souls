"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Play, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  PATTERN_TEMPLATES,
  type DrawMatchResult,
  type DrawPoint,
  type DrawScanReport,
} from "../../../backend/engines/pattern-draw";
import type { SoulGenomeReport } from "../../../backend/engines/soul-genome";
import { api, type Notice } from "../../components/workspace/shared";

type Props = {
  authenticated: boolean;
  onRequireAuth?: () => void;
  scanName?: string;
  onRequireName?: (message: string) => void;
  universe: "ECB_DAILY" | "CONNECTED_MARKETS";
  interval: "30m" | "1h" | "1d" | "1wk" | "1mo";
  customCsv?: string;
  instrumentIds?: string[];
  busy: boolean;
  onScanComplete: (res: {
    id: string;
    drawReport: DrawScanReport;
    soulGenome?: SoulGenomeReport;
  }) => Promise<void> | void;
  onOpenAsset: (id: string) => void;
  notify: Notice;
};

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

  return (
    <svg
      viewBox="0 0 220 64"
      style={{ width: "100%", height: 64, display: "block" }}
      role="img"
      aria-label={`Overlay comparing drawn shape and ${match.instrumentId}`}
    >
      <path
        d={toPath(q)}
        fill="none"
        stroke="var(--x1-title-blue)"
        strokeWidth="1.6"
        strokeDasharray="4 3"
      />
      <path
        d={toPath(s)}
        fill="none"
        stroke="var(--x51-green)"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * Interactive Draw Canvas for Advanced Soul Scan:
 * - Touch, pointer, mouse, and keyboard-accessible 8 pattern templates.
 * - Undo, Erase last segment, Clear, Reset.
 * - Submits normalized stroke points to POST /api/strategy/scan (run-draw-scan).
 * - Displays descriptive Pattern Fit (0–100) + normalized SVG overlay (NEVER forward probability).
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
  busy,
  onScanComplete,
  onOpenAsset,
  notify,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localNameRef = useRef<HTMLInputElement>(null);
  const [strokes, setStrokes] = useState<DrawPoint[][]>([
    [...PATTERN_TEMPLATES[0].points],
  ]);
  const [activeTemplate, setActiveTemplate] = useState<string>(
    PATTERN_TEMPLATES[0].id,
  );
  const [drawing, setDrawing] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [localName, setLocalName] = useState("");
  const [localNameError, setLocalNameError] = useState("");
  const [windowBars, setWindowBars] = useState(20);
  const [minPatternFit, setMinPatternFit] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [lastReport, setLastReport] = useState<DrawScanReport | null>(null);

  const isControlledName = controlledName !== undefined;
  const effectiveName = isControlledName ? controlledName : localName;
  const flatPoints = strokes.flat();

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, canvas.clientWidth || 480);
    const h = Math.max(180, canvas.clientHeight || 220);
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Subtle reference grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
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

    // Draw stroke paths
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      stroke.forEach((pt, idx) => {
        const px = 14 + pt.x * (w - 28);
        const py = 14 + (1 - pt.y) * (h - 28);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = "#6ee7b7";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Anchor dots at start/end
      const first = stroke[0];
      const last = stroke[stroke.length - 1];
      ctx.fillStyle = "#76c0ff";
      for (const endPt of [first, last]) {
        ctx.beginPath();
        ctx.arc(
          14 + endPt.x * (w - 28),
          14 + (1 - endPt.y) * (h - 28),
          3.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }, [strokes]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const onResize = () => renderCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderCanvas]);

  function pointerToPoint(e: React.PointerEvent<HTMLCanvasElement>): DrawPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - 14) / Math.max(1, rect.width - 28)));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - 14) / Math.max(1, rect.height - 28)));
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = pointerToPoint(e);
    if (eraseMode) {
      // Remove points near the eraser radius
      setStrokes((prev) =>
        prev
          .map((s) => s.filter((p) => Math.hypot(p.x - pt.x, p.y - pt.y) > 0.08))
          .filter((s) => s.length >= 2),
      );
      setActiveTemplate("");
      return;
    }
    setDrawing(true);
    setActiveTemplate("");
    setStrokes((prev) => [...prev, [pt]]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || eraseMode) return;
    const pt = pointerToPoint(e);
    setStrokes((prev) => {
      if (prev.length === 0) return [[pt]];
      const copy = [...prev];
      const current = copy[copy.length - 1];
      const last = current[current.length - 1];
      if (!last || Math.hypot(last.x - pt.x, last.y - pt.y) >= 0.015) {
        copy[copy.length - 1] = [...current, pt].slice(0, 240);
      }
      return copy;
    });
  }

  function handlePointerUp() {
    setDrawing(false);
  }

  function applyTemplate(templateId: string) {
    const tpl = PATTERN_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setActiveTemplate(tpl.id);
    setEraseMode(false);
    setStrokes([[...tpl.points]]);
  }

  async function runDrawScan() {
    const trimmedName = effectiveName.trim();
    if (!trimmedName) {
      if (onRequireName) {
        onRequireName("Enter a Soul name");
      } else {
        setLocalNameError("Enter a Soul name");
        localNameRef.current?.focus();
      }
      return;
    }
    if ([...trimmedName].length < 3) {
      const msg = "Soul name requires 3–100 characters";
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
    if (flatPoints.length < 2) {
      notify("Draw a shape on the canvas or choose one of the 8 templates first.", true);
      return;
    }
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      const res = await api<{
        id: string;
        drawReport: DrawScanReport;
        soulGenome?: SoulGenomeReport;
      }>("/api/strategy/scan", {
        action: "run-draw-scan",
        requestId: crypto.randomUUID(),
        name: trimmedName,
        description: `Drawn pattern similarity search (${windowBars}-bar lookback, min fit ${minPatternFit}).`,
        strokePoints: flatPoints.slice(0, 360),
        windowBars,
        minPatternFit,
        universe,
        interval,
        ...(customCsv?.trim() ? { customCsv } : {}),
        ...(instrumentIds?.length ? { instrumentIds } : {}),
      });
      setLastReport(res.drawReport);
      await onScanComplete(res);
      notify(
        `Draw scan completed: ${res.drawReport.matches.length} matching instrument(s) found.`,
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Draw pattern scan failed.",
        true,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="x51-draw-stage">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.94rem" }}>
            Interactive Pattern Draw (Normalized Pearson + Bounded DTW)
          </strong>
          <p className="x1-caption" style={{ margin: "2px 0 0" }}>
            Sketch any price trajectory or pick a keyboard-accessible template.
            Matches are scored by descriptive Pattern Fit (0–100), never
            forecast probability.
          </p>
        </div>
        <div className="x1-actions" style={{ gap: 6 }}>
          <button
            type="button"
            className="x1-secondary"
            style={{ minHeight: 34, padding: "0 10px", fontSize: "0.78rem" }}
            disabled={strokes.length === 0}
            onClick={() => setStrokes((s) => s.slice(0, -1))}
            title="Undo last stroke"
          >
            <Undo2 size={13} />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className={eraseMode ? "x51-accent-btn" : "x1-secondary"}
            style={{ minHeight: 34, padding: "0 10px", fontSize: "0.78rem" }}
            aria-pressed={eraseMode}
            onClick={() => setEraseMode((v) => !v)}
          >
            <Eraser size={13} />
            <span>{eraseMode ? "Erasing" : "Erase"}</span>
          </button>
          <button
            type="button"
            className="x1-secondary"
            style={{ minHeight: 34, padding: "0 10px", fontSize: "0.78rem" }}
            onClick={() => {
              setStrokes([]);
              setActiveTemplate("");
            }}
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
          <button
            type="button"
            className="x1-secondary"
            style={{ minHeight: 34, padding: "0 10px", fontSize: "0.78rem" }}
            onClick={() => applyTemplate(PATTERN_TEMPLATES[0].id)}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 8 Keyboard-Accessible Pattern Templates */}
      <div className="x51-chip-row" role="group" aria-label="8 pattern templates">
        {PATTERN_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={"x51-chip" + (activeTemplate === tpl.id ? " is-active" : "")}
            aria-pressed={activeTemplate === tpl.id}
            onClick={() => applyTemplate(tpl.id)}
            title={tpl.description}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        className="x51-draw-canvas"
        aria-label="Interactive price shape drawing canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="x1-form-grid">
        {!isControlledName && (
          <label>
            Soul name
            <input
              ref={localNameRef}
              value={localName}
              maxLength={100}
              aria-invalid={localNameError ? "true" : undefined}
              onChange={(e) => {
                setLocalName(e.target.value);
                if (localNameError) setLocalNameError("");
              }}
              placeholder="Name your Soul"
            />
            {localNameError && (
              <span role="alert" className="x1-form-error">
                {localNameError}
              </span>
            )}
          </label>
        )}
        <label>
          Lookback ({windowBars} bars)
          <input
            type="range"
            min={10}
            max={60}
            step={2}
            value={windowBars}
            onChange={(e) => setWindowBars(Number(e.target.value))}
          />
        </label>
        <label>
          Min Pattern Fit ({minPatternFit}/100)
          <input
            type="range"
            min={45}
            max={90}
            step={1}
            value={minPatternFit}
            onChange={(e) => setMinPatternFit(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="x1-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span className="x1-caption">
          {flatPoints.length} points · Descriptive fit (0–100)
        </span>
        <button
          type="button"
          className="x1-primary x1-motion-button"
          disabled={submitting || busy || flatPoints.length < 2}
          onClick={() => void runDrawScan()}
        >
          <Play size={15} />
          <span>{submitting ? "Matching shapes…" : "Run draw scan"}</span>
        </button>
      </div>

      {lastReport && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="x1-caption">
            <strong>{lastReport.matches.length} match(es)</strong> across{" "}
            {lastReport.evaluated} evaluated instruments ({lastReport.method}).
          </div>
          {lastReport.matches.length > 0 ? (
            <div className="x51-genome-grid">
              {lastReport.matches.map((m) => (
                <div key={m.instrumentId} className="x51-genome-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="x1-text-button"
                      onClick={() => onOpenAsset(m.instrumentId)}
                    >
                      <strong>{m.instrumentId}</strong>
                    </button>
                    <span className="x51-pill x51-pill-green">
                      Pattern Fit {m.patternFit}/100
                    </span>
                  </div>
                  <NormalizedOverlaySvg match={m} />
                  <p className="x1-caption" style={{ margin: 0 }}>
                    r={m.correlation.toFixed(2)} · DTW {m.dtwDistance.toFixed(2)} ·{" "}
                    {m.windowStartAt.slice(0, 10)} → {m.windowEndAt.slice(0, 10)}
                  </p>
                  <p className="x1-caption" style={{ margin: 0 }}>
                    Dashed blue: your drawing · Solid green: observed closes
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="x1-callout">
              No eligible instruments reached Pattern Fit ≥ {lastReport.minPatternFit}.
              Lower the Pattern Fit slider or test with the 5-stock Indian equity CSV fixture.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
