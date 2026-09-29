import { describe, expect, it } from "vitest";
import { createFailureRateLimiter } from "./failure-rate-limiter";

describe("createFailureRateLimiter", () => {
  it("limits a key after the maximum failures within the window", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxFailures: 3, now: () => now, windowMs: 1000 });

    limiter.recordFailure("ip:1");
    limiter.recordFailure("ip:1");
    expect(limiter.isLimited("ip:1")).toBe(false);

    limiter.recordFailure("ip:1");
    expect(limiter.isLimited("ip:1")).toBe(true);
    expect(limiter.isLimited("ip:2")).toBe(false);

    now = 1001;
    expect(limiter.isLimited("ip:1")).toBe(false);
  });

  it("slides the window so old failures expire individually", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxFailures: 2, now: () => now, windowMs: 1000 });

    limiter.recordFailure("k");
    now = 600;
    limiter.recordFailure("k");
    expect(limiter.isLimited("k")).toBe(true);

    now = 1001;
    expect(limiter.isLimited("k")).toBe(false);
    limiter.recordFailure("k");
    expect(limiter.isLimited("k")).toBe(true);
  });
});
