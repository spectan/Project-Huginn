import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    currentViewer: null as null | {
      accessLevel: "READ";
      approvalStatus: "APPROVED";
      id: string;
      isAdmin: false;
      mapPermissions: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
      username: string;
    }
  };

  const listMarkers = vi.fn(async () => ({
    ok: true as const,
    value: {
      map: {
        heightPx: 2048,
        id: "map-1",
        imageSrc: "/maps/celebration-terrain.png",
        layers: [],
        name: "Celebration",
        widthPx: 2048
      },
      markers: []
    }
  }));

  return {
    auditCreate: vi.fn(async () => ({})),
    listMarkers,
    state,
    triggerAlertDetection: vi.fn()
  };
});

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.state.currentViewer)
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: { create: mocks.auditCreate }
  }
}));

vi.mock("@/lib/markers/database", () => ({
  createMarkerDependencies: vi.fn(() => ({})),
  findActiveMap: vi.fn(async (mapId: string) => ({ id: mapId })),
  listActiveMapSummaries: vi.fn(async () => [{ id: "map-1" }])
}));

vi.mock("@/lib/markers/marker-service", () => ({
  listMarkers: mocks.listMarkers
}));

import { GET } from "./route";

type AuthorizedViewer = {
  accessLevel: "READ";
  approvalStatus: "APPROVED";
  id: string;
  isAdmin: false;
  mapPermissions: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
  username: string;
};

const AUTHORIZED_VIEWER: AuthorizedViewer = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }],
  username: "Reader"
};

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/maps/active", { headers });
}

describe("GET /api/maps/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
  });

  it("returns 403 when the user is not authenticated", async () => {
    const response = await GET(buildRequest());

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
    expect(mocks.listMarkers).not.toHaveBeenCalled();
  });

  it("lists markers with canaries included for the authenticated viewer", async () => {
    mocks.state.currentViewer = AUTHORIZED_VIEWER;

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(mocks.listMarkers).toHaveBeenCalledWith(
      { actor: mocks.state.currentViewer, includeCanaries: true, mapId: "map-1" },
      expect.anything()
    );
  });

  it("writes a MAP_DATA_ACCESSED audit event and triggers alert detection on success", async () => {
    mocks.state.currentViewer = AUTHORIZED_VIEWER;

    const response = await GET(buildRequest({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));

    expect(response.status).toBe(200);
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        action: "MAP_DATA_ACCESSED",
        actorUserId: "user-1",
        metadata: { clientIp: "203.0.113.7" },
        targetId: "map-1",
        targetType: "MAP"
      }
    });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not audit or trigger detection when the user is not authenticated", async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(403);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.triggerAlertDetection).not.toHaveBeenCalled();
  });

  it("does not audit or trigger detection when the viewer cannot read any map", async () => {
    mocks.state.currentViewer = {
      ...AUTHORIZED_VIEWER,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "other-map" }]
    };

    const response = await GET(buildRequest());

    expect(response.status).toBe(404);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.triggerAlertDetection).not.toHaveBeenCalled();
  });

  it("still serves markers when the audit write rejects", async () => {
    mocks.state.currentViewer = AUTHORIZED_VIEWER;
    mocks.auditCreate.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { map: { id: string } };
    expect(body.map.id).toBe("map-1");
  });
});
