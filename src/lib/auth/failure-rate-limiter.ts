export type FailureRateLimiter = {
  isLimited(key: string): boolean;
  recordFailure(key: string): void;
};

const DEFAULT_MAX_FAILURES = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

/**
 * In-memory sliding-window limiter for failed credential checks. State is
 * per-process, which is sufficient for the single-instance deployment.
 */
export function createFailureRateLimiter(options: {
  maxFailures?: number;
  now?: () => number;
  windowMs?: number;
} = {}): FailureRateLimiter {
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const failures = new Map<string, number[]>();

  function recentFailures(key: string, at: number): number[] {
    const recent = (failures.get(key) ?? []).filter((timestamp) => timestamp > at - windowMs);

    if (recent.length === 0) {
      failures.delete(key);
    } else {
      failures.set(key, recent);
    }

    return recent;
  }

  function pruneExpired(at: number): void {
    for (const key of Array.from(failures.keys())) {
      recentFailures(key, at);
    }
  }

  return {
    isLimited(key) {
      return recentFailures(key, now()).length >= maxFailures;
    },
    recordFailure(key) {
      const at = now();

      if (failures.size >= MAX_TRACKED_KEYS) {
        pruneExpired(at);
      }

      failures.set(key, [...recentFailures(key, at), at].slice(-maxFailures));
    }
  };
}
