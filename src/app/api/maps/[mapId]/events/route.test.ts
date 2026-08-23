import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentViewer: null as null | {
    accessLevel: "READ";
    approvalStatus: "APPROVED";
    id: string;
    isAdmin: false;
    mapPermissions?: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
  },
  storedEvents: [] as Array<{ id: string; message: string; timestamp: number }>,
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

vi.mock("@/lib/events/database", () => ({
  listEventsForMap: vi.fn(async () => mocks.storedEvents),
  upsertEvents: vi.fn(async () => undefined)
}));

vi.mock("@/lib/events/event-feed", () => ({
  fetchOfficialEventFeed: vi.fn(async () => ({
    events: [
      { id: "event-1", message: "A new mission is available!", timestamp: 1778385063 }
    ],
    fetchedAt: "2026-05-13T04:00:00.000Z",
    sourceUrl: "https://celebration.wurmonline.com/battles/server_feed.xml"
  })),
  getOfficialFeedUrl: vi.fn(() => "https://celebration.wurmonline.com/battles/server_feed.xml")
}));

import { GET } from "./route";

describe("GET /api/maps/[mapId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.map = {
      id: "map-1",
      name: "Celebration"
    };
    mocks.storedEvents = [];
  });

  it("requires map read access", async () => {
    const response = await GET(new Request("http://localhost/api/maps/map-1/events"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
  });

  it("returns stored events when available", async () => {
    mocks.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ]
    };
    mocks.storedEvents = [
      { id: "stored-1", message: "Test event", timestamp: 1778385063 }
    ];

    const response = await GET(new Request("http://localhost/api/maps/map-1/events"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.feed.events).toHaveLength(1);
    expect(body.feed.events[0]).toMatchObject({
      id: "stored-1",
      kind: "event",
      label: "Event",
      message: "Test event",
      timestamp: 1778385063
    });
  });

  it("fetches from official feed when no stored events", async () => {
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

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.feed.events).toHaveLength(1);
    expect(body.feed.events[0]).toMatchObject({
      kind: "event",
      label: "Event",
      message: "A new mission is available!"
    });
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
