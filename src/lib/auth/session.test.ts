import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken } from "./session";

describe("session token helpers", () => {
  it("creates unguessable unique session tokens", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(second.length).toBeGreaterThanOrEqual(43);
  });

  it("hashes session tokens before storage", () => {
    const token = "session-token";
    const hashed = hashSessionToken(token);

    expect(hashed).not.toBe(token);
    expect(hashed).toBe(hashSessionToken(token));
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });
});
