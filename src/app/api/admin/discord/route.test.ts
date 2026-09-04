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
  getDiscordConfig: vi.fn(),
  saveDiscordConfig: vi.fn()
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/discord/discord-service", () => ({
  getDiscordConfig: mocks.getDiscordConfig,
  saveDiscordConfig: mocks.saveDiscordConfig
}));

vi.mock("@/lib/discord/database", () => ({
  createDiscordDependencies: vi.fn(() => ({}))
}));

import { GET, PUT } from "./route";

const adminViewer: TestViewer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-1",
  isAdmin: true,
  username: "root"
};

const configFixture = {
  webhookUrl: "https://discord.com/api/webhooks/1234/token",
  enabled: true,
  alertSeverityHigh: true,
  alertSeverityMedium: false,
  alertSeverityLow: false,
  notifyRegistrations: true,
  notifyApprovals: false
};

describe("GET /api/admin/discord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.getDiscordConfig.mockResolvedValue({ ok: true, value: configFixture });
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.getDiscordConfig).not.toHaveBeenCalled();

    mocks.currentViewer = { ...adminViewer, isAdmin: false };

    const nonAdminResponse = await GET();

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.getDiscordConfig).not.toHaveBeenCalled();
  });

  it("returns the current config", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ config: configFixture });
  });
});

describe("PUT /api/admin/discord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.saveDiscordConfig.mockResolvedValue({ ok: true, value: configFixture });
  });

  function putRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/discord", {
      body: JSON.stringify(body),
      method: "PUT"
    });
  }

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await PUT(putRequest(configFixture));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.saveDiscordConfig).not.toHaveBeenCalled();

    mocks.currentViewer = { ...adminViewer, isAdmin: false };

    const nonAdminResponse = await PUT(putRequest(configFixture));

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.saveDiscordConfig).not.toHaveBeenCalled();
  });

  it("saves a valid config and returns it", async () => {
    const response = await PUT(putRequest(configFixture));

    expect(response.status).toBe(200);
    expect(mocks.saveDiscordConfig).toHaveBeenCalledWith(configFixture, expect.anything());
    await expect(response.json()).resolves.toEqual({ config: configFixture });
  });

  it("maps validation errors to a 400 response", async () => {
    mocks.saveDiscordConfig.mockResolvedValue({
      ok: false,
      error: "Webhook URL must be a Discord webhook URL"
    });

    const response = await PUT(putRequest({ webhookUrl: "https://example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook URL must be a Discord webhook URL"
    });
  });

  it("maps an unparseable body to a 400 response", async () => {
    mocks.saveDiscordConfig.mockResolvedValue({
      ok: false,
      error: "Discord config is required"
    });

    const response = await PUT(new Request("http://localhost/api/admin/discord", {
      body: "not-json{",
      method: "PUT"
    }));

    expect(response.status).toBe(400);
    expect(mocks.saveDiscordConfig).toHaveBeenCalledWith(null, expect.anything());
    await expect(response.json()).resolves.toEqual({ error: "Discord config is required" });
  });
});
