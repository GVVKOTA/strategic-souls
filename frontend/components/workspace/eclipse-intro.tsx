"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const INTRO_SESSION_KEY = "ss-x1-intro-seen";
const VISIT_KEY = "ss.intro.v3";
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
  const [phase, setPhase] = useState<"enter" | "exit" | "done">(ready ? "done" : "enter");
  const [eligible, setEligible] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const started = useRef(0);
  const dismissed = useRef(false);
  const claimed = useRef(false);
  const exitTimer = useRef<number | null>(null);
  const dismissCallback = useRef(onDismiss);
  useEffect(() => { dismissCallback.current = onDismiss; }, [onDismiss]);

  const dismiss = useCallback((focusMain = false) => {
    if (dismissed.current) return;
    dismissed.current = true;
    if (focusMain || document.activeElement === skip.current) {
      document.getElementById("x1-main")?.focus({ preventScroll: true });
    }
    setPhase("exit");
    exitTimer.current = window.setTimeout(() => {
      setPhase("done");
      dismissCallback.current?.();
    }, INTRO_EXIT_MS);
  }, []);

  useEffect(() => {
    if (phase !== "enter") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const routeIsEntry = location.pathname === "/" && !location.search && !location.hash;
    const fromAuth = /\/(?:signin|login|auth)(?:[/?#]|$)/i.test(document.referrer);
    let alive = true;
    let allowed = false;
    try {
      const seen = !claimed.current && (window.localStorage.getItem(VISIT_KEY) !== null ||
        window.sessionStorage.getItem(INTRO_SESSION_KEY) !== null);
      allowed = (preview || (routeIsEntry && !fromAuth)) && !document.hidden && !connection?.saveData &&
        shouldShowIntro({ ready, seen, preview, reducedMotion: media.matches ||
          window.localStorage.getItem("ss-motion-pref") === "minimal" });
      if (allowed && !preview) {
        window.localStorage.setItem(VISIT_KEY, "1");
        claimed.current = true;
      }
    } catch { allowed = false; }
    if (!allowed) {
      queueMicrotask(() => { if (alive) { setPhase("done"); if (preview) dismissCallback.current?.(); } });
      return () => { alive = false; };
    }
    started.current = performance.now();
    queueMicrotask(() => { if (alive) setEligible(true); });
    const timer = window.setTimeout(() => dismiss(), INTRO_MAX_MS - INTRO_EXIT_MS);
    const motionChanged = () => { if (media.matches) dismiss(); };
    const hidden = () => { if (document.hidden) dismiss(); };
    const interaction = (event: Event) => {
      if (event.target instanceof Node && skip.current?.contains(event.target)) return;
      dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss(true);
      else if (event.key !== "Tab" && !skip.current?.contains(document.activeElement)) dismiss();
    };
    const passive = { capture: true, passive: true };
    window.addEventListener("pointerdown", interaction, passive);
    window.addEventListener("keydown", key, true);
    window.addEventListener("wheel", interaction, passive);
    window.addEventListener("scroll", interaction, passive);
    document.addEventListener("visibilitychange", hidden);
    media.addEventListener("change", motionChanged);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", interaction, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", interaction, true);
      window.removeEventListener("scroll", interaction, true);
      document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", motionChanged);
    };
  }, [dismiss, phase, preview, ready]);

  useEffect(() => {
    const host = scene.current;
    if (!eligible || phase !== "enter" || !host) return;
    let alive = true;
    let stop: (() => void) | undefined;
    const elapsed = () => (performance.now() - started.current) / (INTRO_MAX_MS - INTRO_EXIT_MS);
    if (preview) skip.current?.focus({ preventScroll: true });
    void import("./eclipse-scene").then(({ startEclipse }) => {
      if (!alive || dismissed.current || elapsed() >= 1) return;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
      stop = startEclipse(canvas, elapsed, () => dismiss());
    }).catch(() => { if (alive) dismiss(); });
    return () => { alive = false; stop?.(); host.replaceChildren(); };
  }, [dismiss, eligible, phase, preview]);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  if (phase === "done") return null;
  return (
    <section
      className="x1-eclipse-intro"
      data-x1-intro=""
      data-eligible={eligible || undefined}
      data-phase={phase}
      data-preview={preview ? "true" : "false"}
      aria-label="Strategic Souls introduction"
      aria-live="off"
      style={{ pointerEvents: "none" }}
    >
      <button
        className="x1-eclipse-skip"
        type="button"
        ref={skip}
        onClick={() => dismiss(true)}
        tabIndex={phase === "exit" ? -1 : 0}
      >
        Skip introduction

      </button>
      <div className="x1-eclipse-scene">
        <div ref={scene} className="x1-eclipse-orbit" aria-hidden="true" />
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
