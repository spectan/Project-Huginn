import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareDependencies } from "@/lib/share/share-service";

const mocks = vi.hoisted(() => {
  const state = {
    currentViewer: null as null | {
      accessLevel: "READ";
      approvalStatus: "APPROVED";
      id: string;
      isAdmin: false;
      mapPermissions?: readonly { accessLevel: "READ"; isOperator: false; mapId: string }[];
    }
  };

  const dependencies: ShareDependencies = {
    createShareLink: vi.fn(async () => {}),
    createShareLinkAlert: vi.fn(async () => {}),
    deleteShareLink: vi.fn(async () => {}),
    findMapName: vi.fn(async () => null),
    findShareLinkWithCreator: vi.fn(async () => null),
    recordAudit: vi.fn(async () => {}),
    settings: {
      findMap: vi.fn(async (mapId) => (mapId === "map-1" ? { id: mapId } : null)),
      findSettings: vi.fn(async () => null),
      upsertSettings: vi.fn(async ({ settings }) => ({ settings }))
    }
  };

  return {
    dependencies,
    state
  };
});

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.state.currentViewer)
}));

vi.mock("@/lib/share/database", () => ({
  createShareDependencies: vi.fn(() => mocks.dependencies)
}));

import { POST } from "./route";

describe("POST /api/maps/[mapId]/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await POST(createShareRequest({ expiresInHours: 4 }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user cannot read the map", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: []
    };

    const response = await POST(createShareRequest({ expiresInHours: 4 }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
  });

  it("returns 400 for an invalid expiresInHours", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }]
    };

    const response = await POST(createShareRequest({ expiresInHours: 48 }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(400);
  });

  it("creates a share link and returns its URL and expiry", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }]
    };

    const response = await POST(createShareRequest({ expiresInHours: 6, layerId: "layer-1" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.url).toMatch(/^\/share\/.+/);
    expect(typeof body.expiresAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    expect(mocks.dependencies.createShareLink).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: "user-1",
        layerId: "layer-1",
        mapId: "map-1"
      })
    );
  });

  it("returns 400 when the body is not valid JSON", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }]
    };

    const request = new Request("http://localhost/api/maps/map-1/share", {
      body: "not json",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    const response = await POST(request, {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(400);
  });
});

function createShareRequest(body: unknown): Request {
  return new Request("http://localhost/api/maps/map-1/share", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
}
