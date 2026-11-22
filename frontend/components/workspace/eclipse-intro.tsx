"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const INTRO_SESSION_KEY = "ss-x1-intro-seen";
export const INTRO_MAX_MS = 1050;
export const INTRO_EXIT_MS = 90;

export type IntroPolicy = {
  ready: boolean;
  seen: boolean;
  reducedMotion: boolean;
  preview?: boolean;
};

/** Preview is an explicit presentation opt-in. It never overrides readiness or reduced motion. */
export function shouldShowIntro({
  ready,
  seen,
  reducedMotion,
  preview = false,
}: IntroPolicy): boolean {
  return !ready && !reducedMotion && (preview || !seen);
}

export type EclipseIntroProps = {
  ready: boolean;
  preview?: boolean;
  onDismiss?: () => void;
};

/** An optional first-entry flourish. App content is never inert, delayed, or pointer-blocked. */
export default function EclipseIntro({
  ready,
  preview = false,
  onDismiss,
}: EclipseIntroProps) {
  const [phase, setPhase] = useState<"enter" | "exit" | "done">(
    ready ? "done" : "enter",
  );
  const dismissed = useRef(ready);
  const claimedThisMount = useRef(false);
  const exitTimer = useRef<number | null>(null);
  const dismissCallback = useRef(onDismiss);

  useEffect(() => {
    dismissCallback.current = onDismiss;
  }, [onDismiss]);

  const remember = useCallback(() => {
    if (preview) return;
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      /* Storage is optional. */
    }
  }, [preview]);

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    remember();
    setPhase("exit");
    exitTimer.current = window.setTimeout(() => {
      if (!preview) document.documentElement.dataset.x1IntroSeen = "true";
      setPhase("done");
    }, INTRO_EXIT_MS);
    dismissCallback.current?.();
  }, [preview, remember]);

  useEffect(() => {
    if (phase !== "enter") return;
    let alive = true;
    // Readiness wins over decorative timing, including an active QA preview.
    if (ready) {
      queueMicrotask(() => {
        if (alive) dismiss();
      });
      return () => {
        alive = false;
      };
    }
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let seen = document.documentElement.dataset.x1IntroSeen !== undefined;
    try {
      seen ||= window.sessionStorage.getItem(INTRO_SESSION_KEY) !== null;
    } catch {
      /* Continue without storage. */
    }
    // React development effect replay may read this very mount's session claim.
    // A fresh component mount still honors the stored preference normally.
    if (claimedThisMount.current) seen = false;
    if (
      !shouldShowIntro({
        ready,
        seen,
        reducedMotion: !!media?.matches,
        preview,
      })
    ) {
      dismissed.current = true;
      remember();
      if (!preview) document.documentElement.dataset.x1IntroSeen = "true";
      queueMicrotask(() => {
        if (alive) setPhase("done");
      });
      return () => {
        alive = false;
      };
    }
    // Claim this session once at entry; never consume market/account data for this preference.
    claimedThisMount.current = true;
    remember();
    const timer = window.setTimeout(dismiss, INTRO_MAX_MS - INTRO_EXIT_MS);
    const motionChanged = (event: MediaQueryListEvent) => {
      if (event.matches) dismiss();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") dismiss();
    };
    const passiveCapture = { capture: true, passive: true };
    window.addEventListener("pointerdown", dismiss, passiveCapture);
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("wheel", dismiss, passiveCapture);
    window.addEventListener("scroll", dismiss, passiveCapture);
    document.addEventListener("visibilitychange", hidden);
    media?.addEventListener?.("change", motionChanged);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("visibilitychange", hidden);
      media?.removeEventListener?.("change", motionChanged);
    };
  }, [dismiss, phase, preview, ready, remember]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  if (phase === "done") return null;
  return (
    <section
      className="x1-eclipse-intro"
      data-x1-intro=""
      data-phase={phase}
      data-preview={preview ? "true" : "false"}
      aria-label="Optional Strategic Souls introduction"
      aria-live="off"
      style={{ pointerEvents: "none" }}
    >
      <button
        className="x1-eclipse-skip"
        type="button"
        onClick={dismiss}
        tabIndex={phase === "exit" ? -1 : 0}
      >
        Skip introduction
        <span aria-hidden="true">↗</span>
      </button>
      <div className="x1-eclipse-scene">
        <svg
          className="x1-eclipse-disc"
          viewBox="0 0 160 160"
          width="128"
          height="128"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="x1-eclipse-corona x1-eclipse-corona-outer"
            cx="80"
            cy="80"
            r="54"
          />
          <circle className="x1-eclipse-corona" cx="80" cy="80" r="50" />
          <circle
            className="x1-eclipse-limb"
            cx="80"
            cy="80"
            r="47"
            pathLength="1"
          />
          <circle className="x1-eclipse-shadow" cx="85" cy="77" r="46" />
        </svg>
        <div
          className="x1-eclipse-identity"
          role="img"
          aria-label="Global Vertex Vectors, Strategic Souls"
        >
          <img className="x2-eclipse-approved-logo" src="/gvv-approved.jpg" width="72" height="72" alt="" />
        </div>
        <h1 className="x1-eclipse-title">STRATEGIC SOULS</h1>
      </div>
    </section>
  );
}
