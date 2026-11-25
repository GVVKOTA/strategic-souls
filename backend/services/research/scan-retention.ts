import { SHARED_HISTORY_LABEL } from "../market-data/data-types";
import type { ScanDataset, ScanResult } from "../../engines/scan";

/** Keep raw time-limited exchange candles in the expiring store, outside immutable personal archives. */
export const isSharedExchangeDataset = (dataset: ScanDataset) => dataset.source === SHARED_HISTORY_LABEL;

export function archivalScanRows<T extends ScanResult>(rows: readonly T[]): T[] {
  return rows.map((row) => {
    if (row.source !== SHARED_HISTORY_LABEL || !row.metrics) return row;
    return {
      ...row,
      reasons: row.reasons.slice(0, 1),
      metrics: {
        ...row.metrics,
        close: null,
        prevClose: null,
        open: null,
        high: null,
        low: null,
        volume: null,
        high20: null,
        low20: null,
      },
    };
  });
}
