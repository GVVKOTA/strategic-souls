"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, Info } from "lucide-react";
export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="x2-info">
      <summary aria-label={label}>
        <Info size={16} />
        <span className="x2-sr-only">{label}</span>
      </summary>
      <div role="note">{children}</div>
    </details>
  );
}
const pendingWrites = new Map<
  string,
  { body: string; promise: Promise<unknown> }
>();
export function api<T = Record<string, unknown>>(
  path: string,
  input?: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const body = input === undefined ? undefined : JSON.stringify(input);
  const rawKey =
    input && typeof input === "object"
      ? ((input as Record<string, unknown>).requestId ??
        (input as Record<string, unknown>).requestKey)
      : null;
  const requestId =
    typeof rawKey === "string" && rawKey.length > 0 ? rawKey : null;
  const key = requestId ? path + ":" + requestId : null;
  const previous = key ? pendingWrites.get(key) : null;
  if (previous)
    return previous.body === body
      ? (previous.promise as Promise<T>)
      : Promise.reject(
          new Error(
            "This request is still pending with different content. Wait for its result.",
          ),
        );
  const task = (async () => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, options.timeoutMs ?? 25_000);
    try {
      const res = await fetch(path, {
        method: input === undefined ? "GET" : "POST",
        headers:
          input === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      let data: T & { error?: string; errorCode?: string; retryable?: boolean; traceId?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 401
            ? "Sign in again to continue. Your input is preserved."
            : "The service returned an unreadable response. Your input is preserved; retry safely.",
        );
      }
      if (!res.ok) {
        const err = new Error(data.error || "The service is unavailable.") as Error & {
          status?: number;
          errorCode?: string;
          retryable?: boolean;
          traceId?: string;
        };
        err.status = res.status;
        if (typeof data.errorCode === "string") err.errorCode = data.errorCode;
        if (typeof data.retryable === "boolean") err.retryable = data.retryable;
        if (typeof data.traceId === "string") err.traceId = data.traceId;
        throw err;
      }
      return data as T;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          options.signal?.aborted
            ? "Request cancelled. Your input is preserved."
            : "Request timed out. Check the saved state before retrying with the same request.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  })();
  if (key) {
    pendingWrites.set(key, { body: body!, promise: task });
    void task.finally(() => pendingWrites.delete(key)).catch(() => {});
  }
  return task;
}
export const number = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);

/** Formats quantities concisely without trailing .0000 noise while preserving true fractional precision. */
export const formatQuantity = (value: number | null | undefined, maxDigits = 4) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
      }).format(value);

/** Formats ledger money cleanly (e.g. ₹10,049.00 for INR, USD 1,250.00 for others). */
export const formatCurrency = (
  value: number | null | undefined,
  currency = "INR",
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const formatted = number(Math.abs(value), 2);
  if (currency.toUpperCase() === "INR") return `${sign}₹${formatted}`;
  return `${sign}${currency.toUpperCase()} ${formatted}`;
};
export const day = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "No observation";
export const moment = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value)) + " IST"
    : "Unavailable";
export function Panel({
  title,
  kicker,
  action,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"x1-panel x1-card-enter " + className}>
      <header className="x1-panel-head">
        <div>
          {kicker && <p className="x1-kicker">{kicker}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
/** Non-blocking, layout-matched skeleton shown only while real async content is pending. */
export function WorkspaceSkeleton({
  label,
  kind = "workspace",
}: {
  label: string;
  kind?: "workspace" | "terminal" | "panel";
}) {
  return (
    <div className="x3-skeleton" role="status" aria-live="polite">
      <div className="x3-skeleton-head">
        <div className="x3-skeleton-bar is-title" aria-hidden="true" />
        <div className="x3-skeleton-bar is-short" aria-hidden="true" />
      </div>
      {kind === "workspace" ? (
        <div className="x3-skeleton-grid" aria-hidden="true">
          <div className="x3-skeleton-card" />
          <div className="x3-skeleton-card" />
          <div className="x3-skeleton-card" />
        </div>
      ) : (
        <div className="x3-skeleton-card" aria-hidden="true" />
      )}
      <p className="x3-skeleton-label">{label}</p>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="x1-empty">
      <div className="x1-empty-mark">◇</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="x1-source-link"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`x1-dialog x1-modal-enter ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="x1-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Sparkline({
  values,
  label,
  large = false,
}: {
  values: number[];
  label: string;
  large?: boolean;
}) {
  if (values.length < 2) return <p className="x1-muted">History unavailable</p>;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1;
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 400},${100 - ((v - low) / span) * 88}`,
    )
    .join(" ");
  return (
    <svg
      className={large ? "x1-chart" : "x1-spark"}
      viewBox="0 0 400 112"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient
          id={large ? "chart-fill" : "spark-fill"}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="var(--x1-text-secondary)"
            stopOpacity=".18"
          />
          <stop
            offset="100%"
            stopColor="var(--x1-text-secondary)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <polygon
        points={"0,112 " + points + " 400,112"}
        fill={`url(#${large ? "chart-fill" : "spark-fill"})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--x1-text-secondary)"
        strokeWidth={large ? 1.5 : 2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export type WorkspaceRecord = {
  id: string;
  kind: string;
  name: string;
  version: number;
  payload: { items?: string[]; currency?: string };
  created_at: string;
};
export type PortfolioSummary = {
  currency: string;
  investedCost: number;
  cash: number;
  realized: number;
  dividends: number;
  marketValue: null;
  unrealized: null;
  cashNotice: string | null;
  holdings: {
    symbol: string;
    quantity: number;
    basis: number;
    averageCost: number;
  }[];
};
export type ScanRun = {
  id: string;
  name: string;
  reviewState?: string | null;
  mode: string;
  digest: string;
  created_at: string;
  redaction?: {
    applied: boolean;
    mode?: "NONE" | "DERIVED_ONLY" | "WITHHELD";
    rawInstrumentIds?: string[];
    derivedInstrumentIds?: string[];
    reason?: string | null;
  };
  payload: {
    rule: { formula: string; presetId?: string | null };
    research?: import("../../../backend/services/research/research").ResearchDefinition;
    origin?: string;
    coverage?: import("../../features/strategy/market-scan-client").MarketScanCoverage;
    patternRecipe?: { points: { x: number; y: number }[]; windowBars: number; minPatternFit: number };
    interval?: string;
    results: {
      asOf: string;
      total: number;
      eligible: number;
      matches: number;
      failed: number;
      unknown: number;
      results: {
        instrumentId: string;
        status: string;
        reasons: string[];
        latestEventAt: string | null;
        source: string;
        metrics?: Record<string, number | null>;
        patternFit?: number;
      }[];
    };
    soulGenome?: import("../../../backend/engines/soul-genome").SoulGenomeReport;
    knownAtPolicy: string;
  };
};
export type SavedPatternRecord = {
  id: string;
  kind: "pattern-template";
  name: string;
  version: number;
  payload: {
    points: { x: number; y: number }[];
    windowBars?: number;
    minPatternFit?: number;
  };
  created_at: string;
};
export type WorkspaceState = {
  records: WorkspaceRecord[];
  archivedRecords?: WorkspaceRecord[];
  savedPatterns?: SavedPatternRecord[];
  researchDrafts?: { id: string; name: string; payload: {
    definition: import("../../../backend/services/research/research").ResearchDefinition;
  } }[];
  scanHistoryHasMore?: boolean;
  scanHistoryNextBefore?: string | null;
  scanEventsHasMore?: boolean;
  scanQuota?: import("../../../backend/services/research/scan-quota").ScanQuotaSummary;
  marketScanAvailable?: boolean;
  pinnedFormulaIds?: string[];
  portfolios: (WorkspaceRecord & { summary: PortfolioSummary })[];
  transactions: {
    id: string;
    portfolio_id: string;
    payload: import("../../../backend/engines/portfolio").Transaction;
    created_at: string;
  }[];
  scans: ScanRun[];
  scanEvents: {
    id: string;
    scan_id: string;
    kind: string;
    note: string;
    created_at: string;
  }[];
};
export type Notice = (message: string, error?: boolean) => void;

/**
 * Truthful clipboard writer — returns true ONLY if the browser actually
 * wrote to the clipboard, never faking success on denied/unsupported environments.
 */
export async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
