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
  const statusLabel = summary ? memoryStatusLabels[summary.status] : unavailable ? "Unavailable" : "Loading";

  return (
    <div
      className="ss-x3-soul-memory-strip"
      role="region"
      aria-label="SOUL MEMORY daily research ranking"
    >
      <div className="ss-x3-soul-memory-meta">
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
