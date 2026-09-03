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
    listMarkers,
    state
  };
});

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.state.currentViewer)
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

describe("GET /api/maps/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
  });

  it("returns 403 when the user is not authenticated", async () => {
    const response = await GET();

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
    expect(mocks.listMarkers).not.toHaveBeenCalled();
  });

  it("lists markers with canaries included for the authenticated viewer", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ],
      username: "Reader"
    };

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listMarkers).toHaveBeenCalledWith(
      { actor: mocks.state.currentViewer, includeCanaries: true, mapId: "map-1" },
      expect.anything()
    );
  });
});
