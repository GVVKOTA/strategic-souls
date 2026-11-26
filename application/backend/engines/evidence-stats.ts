/**
 * Strategic Souls X5.3 — Deterministic Evidence & Empirical Probability Statistics.
 * Pure, client-safe math with strict boundary guards:
 * - Never divides by zero (returns null -> rendered as "N/A").
 * - Probabilities and Wilson 95% CI bounds strictly clamped within [0, 1].
 * - Brier score computed strictly over finite predicted p in [0, 1] and binary outcomes y in {0, 1}.
 */

export function computeCoveragePct(
  eligible: number,
  total: number,
): number | null {
  if (
    !Number.isFinite(eligible) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    eligible < 0
  ) {
    return null;
  }
  const pct = (100 * Math.min(eligible, total)) / total;
  return Math.round(pct * 10) / 10;
}

export function computeMatchPct(
  passed: number,
  eligible: number,
): number | null {
  if (
    !Number.isFinite(passed) ||
    !Number.isFinite(eligible) ||
    eligible <= 0 ||
    passed < 0
  ) {
    return null;
  }
  const pct = (100 * Math.min(passed, eligible)) / eligible;
  return Math.round(pct * 10) / 10;
}

export function computeEmpiricalProbability(
  observedSuccesses: number,
  observedTrials: number,
): number | null {
  if (
    !Number.isFinite(observedSuccesses) ||
    !Number.isFinite(observedTrials) ||
    observedTrials <= 0 ||
    observedSuccesses < 0 ||
    observedSuccesses > observedTrials
  ) {
    return null;
  }
  const p = observedSuccesses / observedTrials;
  return Math.max(0, Math.min(1, p));
}

export type WilsonInterval = {
  p: number;
  center: number;
  halfWidth: number;
  low: number;
  high: number;
  n: number;
  z: number;
};

/**
 * Wilson score confidence interval (default z = 1.96 for 95% nominal CI)
 * for independent binomial samples. Returns null when n <= 0 or inputs invalid.
 */
export function computeWilsonInterval95(
  successes: number,
  trials: number,
  z = 1.96,
): WilsonInterval | null {
  const p = computeEmpiricalProbability(successes, trials);
  if (p === null || !Number.isFinite(z) || z <= 0) return null;
  const n = trials;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const low = Math.max(0, center - halfWidth);
  const high = Math.min(1, center + halfWidth);
  return {
    p,
    center,
    halfWidth,
    low,
    high,
    n,
    z,
  };
}

export type CalibrationPair = {
  predicted: number;
  outcome: 0 | 1;
};

/**
 * Brier score = mean((p_i - y_i)^2) over real, timestamp-valid out-of-sample predictions.
 * Returns null if no valid finite pairs exist.
 */
export function computeBrierScore(
  pairs: readonly CalibrationPair[],
): number | null {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  let sumSq = 0;
  let count = 0;
  for (const item of pairs) {
    if (
      !item ||
      !Number.isFinite(item.predicted) ||
      item.predicted < 0 ||
      item.predicted > 1 ||
      (item.outcome !== 0 && item.outcome !== 1)
    ) {
      continue;
    }
    const diff = item.predicted - item.outcome;
    sumSq += diff * diff;
    count++;
  }
  if (count === 0) return null;
  return Math.round((sumSq / count) * 10000) / 10000;
}

export function formatStatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(digits)}%`;
}
