"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { FrozenSoulMemorySnapshot, SoulMemoryStatus } from "../../../backend/services/research/soul-memory";
import { api } from "../../components/workspace/shared";

type SoulMemorySummaryView = Pick<
  FrozenSoulMemorySnapshot,
  "istDay" | "status" | "scansAnalyzed" | "distinctSignals" | "evaluatedOutcomes" | "asOfCutoff"
> & {
  resetLabel?: string;
  note?: string;
};

const DEFAULT_RESET_LABEL = "Resets 00:00 IST";
const DEFAULT_MEMORY_NOTE =
  "Adaptive ranking changes the order of original formula matches when there is enough comparable evidence.";
const memoryStatusLabels: Record<SoulMemoryStatus, string> = {
  BASELINE: "Baseline",
  LEARNING: "Gathering evidence",
  ACTIVE: "Active today",
  INSUFFICIENT: "Insufficient evidence",
  UNAVAILABLE: "Unavailable",
};
const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

type Props = {
  authenticated: boolean;
  refreshNonce: number;
  enabled: boolean;
  onToggle: (next: boolean) => void;
};

function SoulMemoryConstellation({
  status,
  activeNodes,
}: {
  status: SoulMemoryStatus | "LOADING";
  activeNodes: number;
}) {
  const engaged = status === "ACTIVE" || status === "LEARNING";
  if (!engaged) {
    return (
      <svg
        className="ve-memory-constellation"
        width="48"
        height="26"
        viewBox="0 0 48 26"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="6"
          y1="13"
          x2="42"
          y2="13"
          stroke="var(--x1-divider-strong)"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeDasharray="2.5 3"
        />
        <circle cx="8" cy="13" r="2.2" fill="var(--x1-divider-strong)" />
        <circle cx="24" cy="13" r="2.8" fill="var(--x1-text-muted)" />
        <circle cx="40" cy="13" r="2.2" fill="var(--x1-divider-strong)" />
      </svg>
    );
  }

  const nodes = [
    { cx: 7, cy: 19, r: 2.6 },
    { cx: 17, cy: 8, r: 3.1 },
    { cx: 28, cy: 16, r: 2.8 },
    { cx: 36, cy: 7, r: 2.5 },
    { cx: 42, cy: 13, r: 3.4 },
  ];
  const count = Math.max(2, Math.min(nodes.length, activeNodes));

  return (
    <svg
      className="ve-memory-constellation"
      width="48"
      height="26"
      viewBox="0 0 48 26"
      fill="none"
      aria-hidden="true"
    >
      {nodes.slice(0, count - 1).map((n, idx) => {
        const next = nodes[idx + 1];
        return (
          <line
            key={`${n.cx}-${next.cx}`}
            x1={n.cx}
            y1={n.cy}
            x2={next.cx}
            y2={next.cy}
            stroke="var(--x1-title-blue)"
            strokeOpacity="0.5"
            strokeWidth="1.35"
          />
        );
      })}
      {count >= 4 && (
        <line
          x1={nodes[1].cx}
          y1={nodes[1].cy}
          x2={nodes[3].cx}
          y2={nodes[3].cy}
          stroke="var(--x1-title-blue-alt)"
          strokeOpacity="0.32"
          strokeWidth="1"
        />
      )}
      {nodes.slice(0, count).map((n, idx) => (
        <circle
          key={n.cx}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          fill={idx === count - 1 ? "var(--x1-title-blue-alt)" : "var(--x1-title-blue)"}
          className={
            idx === count - 1
              ? "ve-memory-node ve-memory-node-pulse"
              : "ve-memory-node"
          }
        />
      ))}
    </svg>
  );
}

export default function SoulMemoryStrip({
  authenticated,
  refreshNonce,
  enabled,
  onToggle,
}: Props) {
  const [summary, setSummary] = useState<SoulMemorySummaryView | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => {
        setSummary(null);
        setUnavailable(false);
      });
      return;
    }
    const ctrl = new AbortController();
    void api<{ soulMemory?: SoulMemorySummaryView }>(
      "/api/strategy/scan?soulMemory=1",
      undefined,
      { signal: ctrl.signal },
    )
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setSummary(res.soulMemory ?? null);
          setUnavailable(!res.soulMemory);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setSummary(null);
          setUnavailable(true);
        }
      });
    return () => ctrl.abort();
  }, [authenticated, refreshNonce]);

  if (!authenticated) return null;

  const evidence = summary?.status === "UNAVAILABLE" ? null : summary;
  const currentStatus: SoulMemoryStatus | "LOADING" =
    summary?.status ?? (unavailable ? "UNAVAILABLE" : "LOADING");
  const statusLabel = summary ? memoryStatusLabels[summary.status] : unavailable ? "Unavailable" : "Loading";
  const activeNodeCount = evidence
    ? Math.min(5, Math.max(2, evidence.distinctSignals || evidence.scansAnalyzed || 2))
    : 0;

  return (
    <div
      className="ss-x3-soul-memory-strip"
      data-memory-status={currentStatus}
      role="region"
      aria-label="SOUL MEMORY daily research ranking"
    >
      <div className="ve-memory-left">
        <SoulMemoryConstellation status={currentStatus} activeNodes={activeNodeCount} />
        <div className="ss-x3-soul-memory-meta">
          <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="ss-x3-memory-dot" aria-hidden="true" />
            <Sparkles size={14} aria-hidden="true" className="ss-research-evidence-mark" />
            <span>SOUL MEMORY · {statusLabel}</span>
          </strong>
          <span>
            {evidence
              ? `${evidence.scansAnalyzed} scan${evidence.scansAnalyzed === 1 ? "" : "s"} · ${evidence.evaluatedOutcomes} evaluated today · ${evidence.resetLabel ?? DEFAULT_RESET_LABEL}`
              : "Private daily research ranking"}
          </span>
          {evidence && (
            <details className="ss-research-evidence">
              <summary>Inspect evidence</summary>
              <p>
                As of {evidence.istDay}, {istTime.format(new Date(evidence.asOfCutoff))} IST · {evidence.distinctSignals} distinct signals
              </p>
              <p>{evidence.note ?? DEFAULT_MEMORY_NOTE}</p>
            </details>
          )}
        </div>
      </div>
      <button
        type="button"
        className={"x51-chip" + (enabled ? " is-active" : "")}
        aria-pressed={enabled}
        onClick={() => onToggle(!enabled)}
      >
        {enabled ? "Ranking order: On" : "Ranking order: Off"}
      </button>
    </div>
  );
}
