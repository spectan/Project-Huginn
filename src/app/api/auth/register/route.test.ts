import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(),
  dependencies: {},
  registerUser: vi.fn()
}));

vi.mock("@/lib/auth/cookies", () => ({
  clearSessionCookie: mocks.clearSessionCookie,
  setSessionCookie: vi.fn()
}));

vi.mock("@/lib/auth/database", () => ({
  createAuthDependencies: vi.fn(() => mocks.dependencies)
}));

vi.mock("@/lib/auth/auth-service", () => ({
  registerUser: mocks.registerUser,
  TOO_MANY_ATTEMPTS_MESSAGE: "Too many failed attempts. Try again later."
}));

import { POST } from "./route";

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  });

  it("passes the client IP to the registration service", async () => {
    mocks.registerUser.mockResolvedValue({ ok: false, error: "Username is already registered" });

    const response = await POST(createRegisterRequest({ "x-forwarded-for": "203.0.113.9" }));

    expect(response.status).toBe(400);
    expect(mocks.registerUser).toHaveBeenCalledWith(
      { password: "pw", username: "Mako" },
      mocks.dependencies,
      { clientIp: "203.0.113.9" }
    );
  });

  it("returns 429 without touching the session cookie when throttled", async () => {
    mocks.registerUser.mockResolvedValue({ ok: false, error: "Too many failed attempts. Try again later." });

    const response = await POST(createRegisterRequest());

    expect(response.status).toBe(429);
    expect(mocks.clearSessionCookie).not.toHaveBeenCalled();
  });
});

function createRegisterRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/register", {
    body: JSON.stringify({ password: "pw", username: "Mako" }),
    headers: { "content-type": "application/json", ...headers },
    method: "POST"
  });
}
