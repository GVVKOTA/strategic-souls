import { api } from "../../components/workspace/shared";

export type MarketScanCoverage = {
  selected: number;
  evaluated: number;
  matched?: number;
  unmatched?: number;
  insufficient: number;
  deniedOrFailed: number;
  deferred: number;
};

export type MarketScanProgress = {
  coverage?: MarketScanCoverage;
  jobId?: string;
  id?: string;
  name?: string;
  universeVersion?: string;
  redactionMode?: "NONE" | "DERIVED_ONLY" | "WITHHELD";
  state?: "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "CANCELLED";
  progress?: number;
};

export type UniverseReadinessView = {
  universe: string;
  name?: string;
  membership: {
    version: string;
    effectiveDate: string;
    expectedCount?: number;
    distinctCount?: number;
    count: number;
  } | null;
  scanReadiness?: { owner: boolean; signedIn: boolean };
  coverage?: {
    expected: number;
    mapped: number;
    fetched: number;
    ready: number;
    stale: number;
    unavailable: number;
    pct: number;
  };
  eligibleTimeframes?: string[];
  rightsMode?: "DISPLAY_AND_DERIVED" | "DERIVED_ONLY" | "NONE";
  sourceQuality?: "PUBLISHED_EOD" | "STALE" | "UNAVAILABLE";
  warming?: boolean;
  lastRefreshAt?: string | null;
  nextRefreshAt?: string | null;
  pausedUntil?: string | null;
  attribution?: { label: string; url: string } | null;
  status: string;
  reasonCode?: string | null;
  reason?: string;
};

export function resultPhase(result: MarketScanProgress, immediateMatches?: number) {
  if (result.state === "PARTIAL") return "PARTIAL";
  const matches = result.coverage?.matched ?? immediateMatches;
  return matches === 0 ? "NO_MATCHES" : "COMPLETE";
}

const SCAN_ENDPOINT = "/api/strategy/scan";

export async function waitForMarketScan<T extends MarketScanProgress>(
  initial: T,
  signal: AbortSignal,
  update: (status: MarketScanProgress) => void,
) {
  let job: MarketScanProgress = initial;
  if (!job.jobId) return initial;
  const path = SCAN_ENDPOINT + "?jobId=" + encodeURIComponent(job.jobId);
  while (job.state === "QUEUED" || job.state === "RUNNING") {
    update(job);
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, 2500);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    job = await api<MarketScanProgress>(path, undefined, { signal });
  }
  update(job);
  if (job.state === "FAILED") throw new Error("Market history was unavailable. Your scan quota was not charged.");
  if (job.state === "CANCELLED") throw new Error("Scan cancelled. Your scan quota was not charged.");
  if (!job.id) throw new Error("The completed scan could not be confirmed.");
  return { ...initial, ...job };
}

export function cancelMarketScan(jobId: string) {
  return api<MarketScanProgress>(SCAN_ENDPOINT, { action: "cancel", jobId });
}

export async function fetchActiveMarketScans(): Promise<MarketScanProgress[]> {
  const res = await api<{ jobs?: MarketScanProgress[] }>(SCAN_ENDPOINT);
  return Array.isArray(res.jobs) ? res.jobs : [];
}

export async function fetchUniverseReadiness(): Promise<UniverseReadinessView | null> {
  try {
    const res = await fetch("/api/strategy/universe", { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as UniverseReadinessView;
  } catch {
    return null;
  }
}
