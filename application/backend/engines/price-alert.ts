export type AlertRule = "ABOVE" | "BELOW" | "RISE" | "FALL";

export function triggeredPriceAlert(rule: AlertRule, threshold: number, prior: number, latest: number) {
  if (![threshold, prior, latest].every((value) => Number.isFinite(value) && value > 0)) return false;
  if (rule === "ABOVE") return prior < threshold && latest >= threshold;
  if (rule === "BELOW") return prior > threshold && latest <= threshold;
  const pct = (latest - prior) / prior * 100;
  return rule === "RISE" ? pct + 1e-10 >= threshold : pct - 1e-10 <= -threshold;
}
