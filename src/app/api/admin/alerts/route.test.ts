import { beforeEach, describe, expect, it, vi } from "vitest";

type TestViewer = {
  accessLevel: "WRITE";
  approvalStatus: "APPROVED";
  id: string;
  isAdmin: boolean;
};

const mocks = vi.hoisted(() => ({
  currentViewer: null as TestViewer | null,
  detectAlerts: vi.fn(),
  listAlerts: vi.fn()
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  detectAlerts: mocks.detectAlerts,
  listAlerts: mocks.listAlerts
}));

import { GET, POST } from "./route";

const adminViewer: TestViewer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-1",
  isAdmin: true
};

const alertFixture = {
  acknowledgedAt: null,
  acknowledgedByUserId: null,
  actorUserId: "user-1",
  actorUsername: "alice",
  createdAt: "2026-05-10T00:00:00.000Z",
  description: "20 markers deleted in the last 15 minutes",
  id: "alert-1",
  mapId: "map-1",
  mapName: "Celebration",
  metadata: { count: 20, windowMinutes: 15 },
  resolvedAt: null,
  resolvedByUserId: null,
  rule: "DELETE_SPIKE",
  severity: "MEDIUM",
  status: "OPEN",
  title: "High marker deletion rate for alice",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

describe("GET /api/admin/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.listAlerts.mockResolvedValue({ ok: true, value: [alertFixture] });
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await GET(new Request("http://localhost/api/admin/alerts"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.listAlerts).not.toHaveBeenCalled();

    mocks.currentViewer = { ...adminViewer, isAdmin: false };

    const nonAdminResponse = await GET(new Request("http://localhost/api/admin/alerts"));

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.listAlerts).not.toHaveBeenCalled();
  });

  it("rejects invalid query parameters", async () => {
    const response = await GET(new Request("http://localhost/api/admin/alerts?severity=BOGUS"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid query parameters" });
    expect(mocks.listAlerts).not.toHaveBeenCalled();
  });

  it("lists alerts with parsed filters", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/alerts?limit=5&severity=HIGH&status=OPEN")
    );

    expect(response.status).toBe(200);
    expect(mocks.listAlerts).toHaveBeenCalledWith({
      limit: 5,
      severity: "HIGH",
      status: "OPEN"
    });

    const body = await response.json() as { alerts: Array<{ id: string; rule: string }> };
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({ id: "alert-1", rule: "DELETE_SPIKE" });
  });

  it("maps service errors to a 400 response", async () => {
    mocks.listAlerts.mockResolvedValue({ ok: false, error: "Alert query failed" });

    const response = await GET(new Request("http://localhost/api/admin/alerts"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Alert query failed" });
  });
});

describe("POST /api/admin/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.detectAlerts.mockResolvedValue({
      ok: true,
      value: { alerts: [alertFixture], created: 1 }
    });
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await POST(new Request("http://localhost/api/admin/alerts", { method: "POST" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.detectAlerts).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const response = await POST(new Request("http://localhost/api/admin/alerts", {
      body: JSON.stringify({ since: "not-a-datetime" }),
      method: "POST"
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mocks.detectAlerts).not.toHaveBeenCalled();
  });

  it("runs detection with the requested range", async () => {
    const response = await POST(new Request("http://localhost/api/admin/alerts", {
      body: JSON.stringify({
        since: "2026-05-09T00:00:00.000Z",
        until: "2026-05-10T00:00:00.000Z"
      }),
      method: "POST"
    }));

    expect(response.status).toBe(200);
    expect(mocks.detectAlerts).toHaveBeenCalledWith({
      since: new Date("2026-05-09T00:00:00.000Z"),
      until: new Date("2026-05-10T00:00:00.000Z")
    });

    const body = await response.json() as { alerts: unknown[]; created: number };
    expect(body.created).toBe(1);
    expect(body.alerts).toHaveLength(1);
  });

  it("runs detection with defaults when the body is empty", async () => {
    const response = await POST(new Request("http://localhost/api/admin/alerts", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.detectAlerts).toHaveBeenCalledWith({
      since: undefined,
      until: undefined
    });
  });

  it("maps service errors to a 400 response", async () => {
    mocks.detectAlerts.mockResolvedValue({ ok: false, error: "Detection failed" });

    const response = await POST(new Request("http://localhost/api/admin/alerts", { method: "POST" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Detection failed" });
  });
});
