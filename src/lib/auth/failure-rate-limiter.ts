export type FailureRateLimiter = {
  /**
   * Atomically checks and counts an attempt. Returns false (and records
   * nothing) when the key is already at the limit, otherwise records the
   * attempt and returns true. Because the check and the increment happen in
   * the same synchronous step, concurrent requests cannot all slip past the
   * check before any failure is recorded.
   */
  tryAcquire(key: string): boolean;
  /**
   * Removes the most recent attempt counted for the key, for attempts that
   * turned out not to be failures (e.g. a successful login).
   */
  release(key: string): void;
};

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_TRACKED_KEYS = 10_000;

/**
 * In-memory sliding-window limiter for credential attempts. State is
 * per-process, which is sufficient for the single-instance deployment. The
 * number of tracked keys is hard-capped: once expired entries are pruned, the
 * least recently used keys are evicted.
 */
export function createFailureRateLimiter(options: {
  maxAttempts?: number;
  maxTrackedKeys?: number;
  now?: () => number;
  windowMs?: number;
} = {}): FailureRateLimiter {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  // Map iteration order is insertion order; keys are re-inserted on every
  // attempt, so the first keys are the least recently used.
  const attempts = new Map<string, number[]>();

  function recentAttempts(key: string, at: number): number[] {
    return (attempts.get(key) ?? []).filter((timestamp) => timestamp > at - windowMs);
  }

  function makeRoom(at: number): void {
    if (attempts.size < maxTrackedKeys) {
      return;
    }

    for (const key of Array.from(attempts.keys())) {
      if (recentAttempts(key, at).length === 0) {
        attempts.delete(key);
      }
    }

    for (const key of attempts.keys()) {
      if (attempts.size < maxTrackedKeys) {
        break;
      }

      attempts.delete(key);
    }
  }

  return {
    release(key) {
      const current = attempts.get(key);

      if (current === undefined) {
        return;
      }

      const remaining = current.slice(0, -1);

      if (remaining.length === 0) {
        attempts.delete(key);
      } else {
        attempts.set(key, remaining);
      }
    },
    tryAcquire(key) {
      const at = now();
      const recent = recentAttempts(key, at);

      attempts.delete(key);

      if (recent.length >= maxAttempts) {
        attempts.set(key, recent);
        return false;
      }

      makeRoom(at);
      attempts.set(key, [...recent, at]);
      return true;
    }
  };
}
