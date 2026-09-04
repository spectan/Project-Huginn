import { beforeEach, describe, expect, it, vi } from "vitest";

type TestViewer = {
  accessLevel: "WRITE";
  approvalStatus: "APPROVED";
  id: string;
  isAdmin: boolean;
  username: string;
};

const mocks = vi.hoisted(() => ({
  currentViewer: null as TestViewer | null,
  sendTestNotification: vi.fn()
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/discord/discord-service", () => ({
  DISCORD_NOT_CONFIGURED_ERROR: "Discord webhook is not configured or enabled",
  sendTestNotification: mocks.sendTestNotification
}));

vi.mock("@/lib/discord/database", () => ({
  createDiscordDependencies: vi.fn(() => ({}))
}));

import { POST } from "./route";

const adminViewer: TestViewer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-1",
  isAdmin: true,
  username: "root"
};

describe("POST /api/admin/discord/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.sendTestNotification.mockResolvedValue({ ok: true, value: null });
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.sendTestNotification).not.toHaveBeenCalled();

    mocks.currentViewer = { ...adminViewer, isAdmin: false };

    const nonAdminResponse = await POST();

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.sendTestNotification).not.toHaveBeenCalled();
  });

  it("sends a test message as the current admin", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.sendTestNotification).toHaveBeenCalledWith(
      { username: "root" },
      expect.anything()
    );
  });

  it("returns 400 when the webhook is not configured", async () => {
    mocks.sendTestNotification.mockResolvedValue({
      ok: false,
      error: "Discord webhook is not configured or enabled"
    });

    const response = await POST();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Discord webhook is not configured or enabled"
    });
  });

  it("returns 502 when Discord rejects the webhook call", async () => {
    mocks.sendTestNotification.mockResolvedValue({
      ok: false,
      error: "Discord webhook request failed with status 500"
    });

    const response = await POST();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Discord webhook request failed with status 500"
    });
  });
});
