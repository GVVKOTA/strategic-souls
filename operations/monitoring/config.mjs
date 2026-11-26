export const DEFAULT_PRODUCTION_URL = "https://strategic-souls.vishnukota20071005.workers.dev";

export const DEFAULT_THRESHOLDS = Object.freeze({
  warnLatencyMs: 4000,
  failLatencyMs: 8000,
  requestTimeoutMs: 15000,
  maxBodyBytes: 524288,
  retries: 2,
  retryBackoffMs: [1000, 2500],
  referenceMaxAgeDays: 7,
  criticalConfirmRuns: 1,
  nonCriticalConfirmRuns: 2,
  recoveryConfirmRuns: 2,
});

const PRIVATE_OR_LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1", "[::1]"]);

function isPrivateOrLocalHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (PRIVATE_OR_LOCAL_HOSTS.has(lower)) return true;
  if (lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return true;
  }
  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }
  const m172 = /^172\.(\d{1,3})\./.exec(lower);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Validates that the configured production target is a real public HTTPS origin
 * and never localhost, loopback, private RFC1918 space, or credential-bearing URL.
 */
export function validateProductionUrl(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return {
      ok: false,
      origin: null,
      error: "Missing production URL. Configure SS_PRODUCTION_URL or supply --url.",
    };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return {
      ok: false,
      origin: null,
      error: "Invalid production URL format.",
    };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      origin: null,
      error: "Production monitor requires an https:// URL.",
    };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      origin: null,
      error: "Production monitor URL must not contain embedded credentials.",
    };
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    return {
      ok: false,
      origin: null,
      error: "Refusing to monitor localhost, loopback, or private-network hosts.",
    };
  }
  return {
    ok: true,
    origin: parsed.origin,
    error: null,
  };
}

function readPositiveInt(raw, fallback, min, max) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return Math.round(parsed);
}

export function resolveMonitorConfig(env = process.env) {
  const warnLatencyMs = readPositiveInt(env.SS_MONITOR_WARN_LATENCY_MS, DEFAULT_THRESHOLDS.warnLatencyMs, 500, 30000);
  const failLatencyMs = Math.max(
    warnLatencyMs + 500,
    readPositiveInt(env.SS_MONITOR_FAIL_LATENCY_MS, DEFAULT_THRESHOLDS.failLatencyMs, 1000, 60000),
  );
  return {
    ...DEFAULT_THRESHOLDS,
    warnLatencyMs,
    failLatencyMs,
    requestTimeoutMs: readPositiveInt(env.SS_MONITOR_TIMEOUT_MS, DEFAULT_THRESHOLDS.requestTimeoutMs, 2000, 30000),
    referenceMaxAgeDays: readPositiveInt(env.SS_MONITOR_REF_MAX_AGE_DAYS, DEFAULT_THRESHOLDS.referenceMaxAgeDays, 1, 30),
    nonCriticalConfirmRuns: readPositiveInt(env.SS_MONITOR_CONFIRM_RUNS, DEFAULT_THRESHOLDS.nonCriticalConfirmRuns, 1, 5),
    recoveryConfirmRuns: readPositiveInt(env.SS_MONITOR_RECOVERY_RUNS, DEFAULT_THRESHOLDS.recoveryConfirmRuns, 1, 5),
  };
}
