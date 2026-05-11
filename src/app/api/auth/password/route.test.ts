import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  changeOwnPassword: vi.fn(),
  currentViewer: null as null | {
    accessLevel: "WRITE";
    approvalStatus: "APPROVED";
    id: string;
    isAdmin: false;
  },
  currentSessionToken: "current-session-token",
  dependencies: {}
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/auth/database", () => ({
  createAuthDependencies: vi.fn(() => mocks.dependencies)
}));

vi.mock("@/lib/auth/auth-service", () => ({
  changeOwnPassword: mocks.changeOwnPassword
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      if (name !== "wurm_session") {
        return undefined;
      }

      return { value: mocks.currentSessionToken };
    })
  }))
}));

import { PATCH } from "./route";

describe("PATCH /api/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.currentSessionToken = "current-session-token";
  });

  it("requires authentication", async () => {
    const response = await PATCH(createPasswordRequest({}));

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
    expect(mocks.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("changes the current user's password through the auth service", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false
    };
    mocks.changeOwnPassword.mockResolvedValue({ ok: true, value: { ok: true } });

    const body = {
      confirmPassword: "new secure password",
      currentPassword: "correct horse battery staple",
      newPassword: "new secure password"
    };
    const response = await PATCH(createPasswordRequest(body));

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(mocks.changeOwnPassword).toHaveBeenCalledWith({
      actor: mocks.currentViewer,
      currentSessionTokenHash: hashSessionToken("current-session-token"),
      input: body
    }, mocks.dependencies);
  });
});

function createPasswordRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/password", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method: "PATCH"
  });
}
