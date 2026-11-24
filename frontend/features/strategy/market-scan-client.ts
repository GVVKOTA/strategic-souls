import { api } from "../../components/workspace/shared";

export type MarketScanCoverage = {
  selected: number; evaluated: number; matched?: number; unmatched?: number;
  insufficient: number; deniedOrFailed: number; deferred: number;
};
export type MarketScanProgress = {
  coverage?: MarketScanCoverage;
  jobId?: string;
  id?: string;
  state?: "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "CANCELLED";
  progress?: number;
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
      if (signal.aborted) { reject(signal.reason); return; }
      const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, 5000);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    job = await api<MarketScanProgress>(path, undefined, { signal });
  }
  update(job);
  if (job.state === "FAILED") throw new Error("Market history was unavailable. No scan was charged.");
  if (job.state === "CANCELLED") throw new Error("Scan cancelled.");
  if (!job.id) throw new Error("The completed scan could not be confirmed.");
  return { ...initial, ...job };
}

export function cancelMarketScan(jobId: string) {
  return api<MarketScanProgress>(SCAN_ENDPOINT, { action: "cancel", jobId });
}
