/**
 * Provider-specific bounded quotas, single-flight deduplication, transient-only backoff,
 * and circuit breaker to prevent retry storms or accidental Angel One bans.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class BoundedRateLimiter {
  private readonly windows = new Map<string, number[]>();

  /**
   * Checks and records a call within a rolling window.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  consume(
    bucket: string,
    maxCalls: number,
    windowMs: number,
    nowMs = Date.now(),
  ): { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number } {
    const cutoff = nowMs - windowMs;
    const timestamps = (this.windows.get(bucket) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= maxCalls) {
      const oldest = timestamps[0] ?? nowMs;
      const retryAfterMs = Math.max(250, oldest + windowMs - nowMs);
      this.windows.set(bucket, timestamps);
      return { allowed: false, retryAfterMs };
    }
    timestamps.push(nowMs);
    this.windows.set(bucket, timestamps);
    return { allowed: true, remaining: Math.max(0, maxCalls - timestamps.length) };
  }

  reset(): void {
    this.windows.clear();
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private state: CircuitState = "CLOSED";

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(failureThreshold = 4, cooldownMs = 30_000) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
  }

  currentState(nowMs = Date.now()): CircuitState {
    if (this.state === "OPEN" && nowMs >= this.openUntil) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  canAttempt(nowMs = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const st = this.currentState(nowMs);
    if (st === "OPEN") {
      return { allowed: false, retryAfterMs: Math.max(1000, this.openUntil - nowMs) };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.state = "CLOSED";
  }

  recordTransientFailure(nowMs = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openUntil = nowMs + this.cooldownMs;
    }
  }

  reset(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.state = "CLOSED";
  }
}

export class SingleFlightCache<T> {
  private readonly cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  async run(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    nowMs = Date.now(),
  ): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > nowMs) {
      return hit.value;
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const promise = (async () => {
      try {
        const result = await fn();
        if (ttlMs > 0) {
          if (this.cache.size >= this.maxEntries) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
          }
          this.cache.set(key, { value: result, expiresAt: Date.now() + ttlMs });
        }
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
  }
}

export async function retryTransient<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 450;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * 150);
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
