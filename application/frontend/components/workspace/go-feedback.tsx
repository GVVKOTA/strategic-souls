"use client";
import { useEffect, useRef, useState } from "react";
import { IconEmberFlame } from "./ss-icons";

export type GoFeedbackDetail = {
  label: string;
  mutationId: string;
  compact?: boolean;
};

const EVENT_NAME = "ss-v3-go-feedback";

/**
 * Triggers Strategic Souls' signature ember + "GO!" feedback strictly after a
 * confirmed server-side mutation succeeds. Deduplicated by `mutationId`.
 * Never invoke on initial load, errors, retries, rollbacks, or sensitive security actions.
 */
export function triggerGoFeedback(
  label: string,
  mutationId: string,
  compact = false,
): void {
  if (typeof window === "undefined" || !mutationId) return;
  window.dispatchEvent(
    new CustomEvent<GoFeedbackDetail>(EVENT_NAME, {
      detail: { label, mutationId, compact },
    }),
  );
}

export default function GoFeedbackHost() {
  const [active, setActive] = useState<GoFeedbackDetail | null>(null);
  const lastMutationIdRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onFeedback = (ev: Event) => {
      const detail = (ev as CustomEvent<GoFeedbackDetail>).detail;
      if (!detail || !detail.mutationId) return;
      if (detail.mutationId === lastMutationIdRef.current) return;
      lastMutationIdRef.current = detail.mutationId;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      setActive(detail);
      const durationMs = detail.compact ? 620 : 840;
      timerRef.current = window.setTimeout(() => {
        setActive(null);
        timerRef.current = null;
      }, durationMs);
    };
    window.addEventListener(EVENT_NAME, onFeedback);
    return () => {
      window.removeEventListener(EVENT_NAME, onFeedback);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="ss-go-host"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {active && (
        <div
          key={active.mutationId}
          className={
            "ss-go-pill" + (active.compact ? " is-compact" : "")
          }
          data-testid="ss-go-feedback"
        >
          <span className="ss-go-flame" aria-hidden="true">
            <IconEmberFlame size={active.compact ? 20 : 26} />
          </span>
          <strong className="ss-go-word">GO!</strong>
          <span className="ss-go-label">{active.label}</span>
        </div>
      )}
    </div>
  );
}
