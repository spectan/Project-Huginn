import { describe, expect, it } from "vitest";
import { createFailureRateLimiter } from "./failure-rate-limiter";

describe("createFailureRateLimiter", () => {
  it("allows the maximum attempts within the window and rejects the rest", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxAttempts: 3, now: () => now, windowMs: 1000 });

    expect(limiter.tryAcquire("ip:1")).toBe(true);
    expect(limiter.tryAcquire("ip:1")).toBe(true);
    expect(limiter.tryAcquire("ip:1")).toBe(true);
    expect(limiter.tryAcquire("ip:1")).toBe(false);
    expect(limiter.tryAcquire("ip:2")).toBe(true);

    now = 1001;
    expect(limiter.tryAcquire("ip:1")).toBe(true);
  });

  it("does not count rejected attempts", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxAttempts: 1, now: () => now, windowMs: 1000 });

    expect(limiter.tryAcquire("k")).toBe(true);
    now = 900;
    expect(limiter.tryAcquire("k")).toBe(false);
    now = 1001;
    expect(limiter.tryAcquire("k")).toBe(true);
  });

  it("slides the window so old attempts expire individually", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxAttempts: 2, now: () => now, windowMs: 1000 });

    limiter.tryAcquire("k");
    now = 600;
    limiter.tryAcquire("k");
    expect(limiter.tryAcquire("k")).toBe(false);

    now = 1001;
    expect(limiter.tryAcquire("k")).toBe(true);
    expect(limiter.tryAcquire("k")).toBe(false);
  });

  it("refunds only the most recent attempt on release", () => {
    const limiter = createFailureRateLimiter({ maxAttempts: 2, now: () => 0, windowMs: 1000 });

    limiter.tryAcquire("k");
    limiter.tryAcquire("k");
    limiter.release("k");
    expect(limiter.tryAcquire("k")).toBe(true);
    expect(limiter.tryAcquire("k")).toBe(false);

    limiter.release("unknown");
  });

  it("counts concurrent attempts synchronously", async () => {
    const limiter = createFailureRateLimiter({ maxAttempts: 3, now: () => 0, windowMs: 1000 });
    const results = await Promise.all(Array.from({ length: 10 }, async () => limiter.tryAcquire("k")));

    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("hard-caps tracked keys by evicting the least recently used ones", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxAttempts: 1, maxTrackedKeys: 2, now: () => now, windowMs: 1000 });

    limiter.tryAcquire("a");
    now = 1;
    limiter.tryAcquire("b");
    now = 2;
    // "c" does not fit; nothing has expired, so "a" (oldest) is evicted.
    limiter.tryAcquire("c");

    expect(limiter.tryAcquire("b")).toBe(false);
    expect(limiter.tryAcquire("c")).toBe(false);
    expect(limiter.tryAcquire("a")).toBe(true);
  });

  it("prunes expired keys before evicting live ones", () => {
    let now = 0;
    const limiter = createFailureRateLimiter({ maxAttempts: 1, maxTrackedKeys: 2, now: () => now, windowMs: 1000 });

    limiter.tryAcquire("old");
    now = 900;
    limiter.tryAcquire("live");
    now = 1200;
    limiter.tryAcquire("new");

    expect(limiter.tryAcquire("live")).toBe(false);
    expect(limiter.tryAcquire("new")).toBe(false);
  });
});
