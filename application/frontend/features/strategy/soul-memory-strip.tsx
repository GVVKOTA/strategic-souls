"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../components/workspace/shared";

export type SoulMemorySummaryView = {
  istDay: string;
  status: "IDLE" | "BASELINE" | "ACTIVE";
  scansAnalyzed: number;
  distinctSignals: number;
  evaluatedOutcomes: number;
  confirmedOutcomes: number;
  resetLabel: string;
  note: string;
};

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
      queueMicrotask(() => setSummary(null));
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

  const statusLabel =
    summary?.status === "ACTIVE"
      ? "Active Today"
      : summary?.status === "BASELINE"
        ? "Baseline"
        : summary ? "Awaiting evidence" : unavailable ? "Unavailable" : "Loading";

  return (
    <div className="ss-x3-soul-memory-strip" role="region" aria-label="SOUL MEMORY daily research ranking">
      <div className="ss-x3-soul-memory-meta">
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={14} aria-hidden="true" style={{ color: "#76C0FF" }} />
          <span>SOUL MEMORY · {statusLabel}</span>
        </strong>
        <span>
          {summary
            ? `${summary.scansAnalyzed} scan${summary.scansAnalyzed === 1 ? "" : "s"} · ${summary.evaluatedOutcomes} evaluated today · ${summary.resetLabel}`
            : "Private daily research ranking · Resets 00:00 IST"}
        </span>
        {summary && (
          <details className="ss-research-evidence">
            <summary>Inspect evidence</summary>
            <p>{summary.istDay} (IST) · {summary.distinctSignals} distinct signals · {summary.evaluatedOutcomes} evaluated outcomes</p>
            <p>{summary.note}</p>
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
