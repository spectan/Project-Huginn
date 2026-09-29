import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/http";

const mocks = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(),
  dependencies: {},
  loginUser: vi.fn()
}));

vi.mock("@/lib/auth/cookies", () => ({
  clearSessionCookie: mocks.clearSessionCookie,
  setSessionCookie: vi.fn()
}));

vi.mock("@/lib/auth/database", () => ({
  createAuthDependencies: vi.fn(() => mocks.dependencies)
}));

vi.mock("@/lib/auth/auth-service", () => ({
  loginUser: mocks.loginUser,
  TOO_MANY_ATTEMPTS_MESSAGE: "Too many failed attempts. Try again later."
}));

import { POST } from "./route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  });

  it("passes the client IP to the login service for rate limiting", async () => {
    mocks.loginUser.mockResolvedValue({ ok: false, error: "Invalid username or password" });

    const response = await POST(createLoginRequest({ "x-forwarded-for": "203.0.113.9" }));

    expect(response.status).toBe(401);
    expect(mocks.clearSessionCookie).toHaveBeenCalledTimes(1);
    expect(mocks.loginUser).toHaveBeenCalledWith(
      { password: "pw", username: "Mako" },
      mocks.dependencies,
      { clientIp: "203.0.113.9" }
    );
  });

  it("returns 429 when login attempts are rate limited", async () => {
    mocks.loginUser.mockResolvedValue({ ok: false, error: "Too many failed attempts. Try again later." });

    const response = await POST(createLoginRequest());

    await expect(response.json()).resolves.toEqual({ error: "Too many failed attempts. Try again later." });
    expect(response.status).toBe(429);
    expect(mocks.clearSessionCookie).not.toHaveBeenCalled();
  });
});

const createLoginRequest = (headers: Record<string, string> = {}) =>
  jsonRequest("http://localhost/api/auth/login", "POST", { password: "pw", username: "Mako" }, headers);
