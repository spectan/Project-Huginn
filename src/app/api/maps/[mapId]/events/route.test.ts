import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentViewer: null as null | {
    accessLevel: "READ";
    approvalStatus: "APPROVED";
    id: string;
    isAdmin: false;
    mapPermissions?: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
  },
  eventFeed: {
    events: [
      {
        id: "deed-1",
        kind: "deed",
        label: "Deed",
        message: "The settlement of Finally Fixing This Bridge has just been disbanded by Rory.",
        subtype: 2,
        timestamp: 1778286018
      }
    ],
    fetchedAt: "2026-05-13T04:00:00.000Z",
    serverStatus: {
      status: "online",
      uptimeSeconds: 53207,
      weather: "A light breeze is coming from the south.",
      wurmTime: "It is 18:30:03 on day of Awakening."
    },
    sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
  },
  map: {
    id: "map-1",
    name: "Celebration"
  } as null | {
    id: string;
    name: string;
  }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/markers/database", () => ({
  findActiveMap: vi.fn(async (mapId?: string) => (mapId === "map-1" ? mocks.map : null))
}));

vi.mock("@/lib/wurmmaps/event-feed", () => ({
  fetchWurmMapsEventFeed: vi.fn(async () => ({ ok: true, value: mocks.eventFeed }))
}));

import { fetchWurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";
import { GET } from "./route";

describe("GET /api/maps/[mapId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.map = {
      id: "map-1",
      name: "Celebration"
    };
  });

  it("requires map read access", async () => {
    const response = await GET(new Request("http://localhost/api/maps/map-1/events"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
  });

  it("returns the normalized event feed for the requested map", async () => {
    mocks.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ]
    };

    const response = await GET(new Request("http://localhost/api/maps/map-1/events"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ feed: mocks.eventFeed });
    expect(response.status).toBe(200);
    expect(fetchWurmMapsEventFeed).toHaveBeenCalledWith("Celebration");
  });

  it("returns 404 when the requested map is missing", async () => {
    mocks.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ]
    };
    mocks.map = null;

    const response = await GET(new Request("http://localhost/api/maps/map-1/events"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Map was not found" });
    expect(response.status).toBe(404);
  });
});
