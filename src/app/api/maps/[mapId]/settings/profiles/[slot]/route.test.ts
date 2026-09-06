import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsProfilesDependencies } from "@/lib/map-settings/map-settings-service";

const mocks = vi.hoisted(() => {
  const state = {
    currentViewer: null as null | {
      accessLevel: "READ";
      approvalStatus: "APPROVED";
      id: string;
      isAdmin: false;
      mapPermissions?: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
    },
    profiles: new Map<string, { name: string; settings: unknown; slot: number; updatedAt: Date }>(),
    settings: new Map<string, unknown>()
  };

  const dependencies: SettingsProfilesDependencies = {
    findMap: vi.fn(async (mapId) => mapId === "map-1" ? { id: mapId } : null),
    findSettings: vi.fn(async (userId, mapId) => {
      const saved = state.settings.get(`${userId}:${mapId}`);
      return saved === undefined ? null : { settings: saved };
    }),
    upsertSettings: vi.fn(async ({ mapId, settings, userId }) => {
      state.settings.set(`${userId}:${mapId}`, settings);
      return { settings };
    }),
    findProfile: vi.fn(async (userId, mapId, slot) =>
      state.profiles.get(`${userId}:${mapId}:${slot}`) ?? null),
    listProfiles: vi.fn(async (userId, mapId) => [...state.profiles.entries()]
      .filter(([key]) => key.startsWith(`${userId}:${mapId}:`))
      .map(([, profile]) => profile)),
    renameProfile: vi.fn(async ({ mapId, name, slot, userId }) => {
      const existing = state.profiles.get(`${userId}:${mapId}:${slot}`);

      if (existing === undefined) {
        return null;
      }

      const renamed = { ...existing, name, updatedAt: new Date() };
      state.profiles.set(`${userId}:${mapId}:${slot}`, renamed);
      return renamed;
    }),
    upsertProfile: vi.fn(async ({ mapId, name, settings, slot, userId }) => {
      const saved = { name, settings, slot, updatedAt: new Date() };
      state.profiles.set(`${userId}:${mapId}:${slot}`, saved);
      return saved;
    })
  };

  return {
    dependencies,
    state
  };
});

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.state.currentViewer)
}));

vi.mock("@/lib/map-settings/database", () => ({
  createSettingsProfilesDependencies: vi.fn(() => mocks.dependencies)
}));

import { GET, PATCH, PUT } from "./route";

const viewer = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ]
} as const;

function createContext(slot: string) {
  return {
    params: Promise.resolve({ mapId: "map-1", slot })
  };
}

function createJsonRequest(method: string, slot: string, body: unknown): Request {
  return new Request(`http://localhost/api/maps/map-1/settings/profiles/${slot}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method
  });
}

describe("GET /api/maps/[mapId]/settings/profiles/[slot]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.profiles.clear();
    mocks.state.settings.clear();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles/0"), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when the slot is not an integer", async () => {
    mocks.state.currentViewer = viewer;

    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles/abc"), createContext("abc"));

    await expect(response.json()).resolves.toEqual({ error: "Slot must be an integer between 0 and 2" });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the profile does not exist", async () => {
    mocks.state.currentViewer = viewer;

    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles/1"), createContext("1"));

    await expect(response.json()).resolves.toEqual({ error: "Profile was not found" });
    expect(response.status).toBe(404);
  });

  it("returns the profile when it exists", async () => {
    mocks.state.currentViewer = viewer;
    mocks.state.profiles.set("user-1:map-1:0", {
      name: "Main",
      settings: { searchLinesEnabled: true },
      slot: 0,
      updatedAt: new Date()
    });

    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles/0"), createContext("0"));

    await expect(response.json()).resolves.toMatchObject({
      profile: {
        name: "Main",
        settings: {
          searchLinesEnabled: true
        },
        slot: 0
      }
    });
    expect(response.status).toBe(200);
  });
});

describe("PUT /api/maps/[mapId]/settings/profiles/[slot]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.profiles.clear();
    mocks.state.settings.clear();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await PUT(createJsonRequest("PUT", "0", {}), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when the slot is out of range", async () => {
    mocks.state.currentViewer = viewer;

    const response = await PUT(createJsonRequest("PUT", "5", {}), createContext("5"));

    await expect(response.json()).resolves.toEqual({ error: "Slot must be an integer between 0 and 2" });
    expect(response.status).toBe(400);
  });

  it("returns 400 when the name is too long", async () => {
    mocks.state.currentViewer = viewer;

    const response = await PUT(createJsonRequest("PUT", "0", { name: "x".repeat(41) }), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Profile name must be 40 characters or fewer" });
    expect(response.status).toBe(400);
  });

  it("saves the current settings into the slot with a default name", async () => {
    mocks.state.currentViewer = viewer;
    mocks.state.settings.set("user-1:map-1", {
      markerColors: {
        towers: "#00ff00"
      }
    });

    const response = await PUT(createJsonRequest("PUT", "2", {}), createContext("2"));

    await expect(response.json()).resolves.toMatchObject({
      profile: {
        name: "Profile 3",
        slot: 2
      }
    });
    expect(response.status).toBe(201);
    expect(mocks.state.profiles.get("user-1:map-1:2")?.settings).toMatchObject({
      markerColors: {
        towers: "#00ff00"
      }
    });
  });

  it("saves with the provided name", async () => {
    mocks.state.currentViewer = viewer;

    const response = await PUT(createJsonRequest("PUT", "1", { name: "  Hunting  " }), createContext("1"));

    await expect(response.json()).resolves.toMatchObject({
      profile: {
        name: "Hunting",
        slot: 1
      }
    });
    expect(response.status).toBe(201);
  });
});

describe("PATCH /api/maps/[mapId]/settings/profiles/[slot]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.profiles.clear();
    mocks.state.settings.clear();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await PATCH(createJsonRequest("PATCH", "0", { name: "New" }), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("returns 404 when the profile does not exist", async () => {
    mocks.state.currentViewer = viewer;

    const response = await PATCH(createJsonRequest("PATCH", "0", { name: "New" }), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Profile was not found" });
    expect(response.status).toBe(404);
  });

  it("returns 400 when the name is blank", async () => {
    mocks.state.currentViewer = viewer;
    mocks.state.profiles.set("user-1:map-1:0", {
      name: "Old",
      settings: {},
      slot: 0,
      updatedAt: new Date()
    });

    const response = await PATCH(createJsonRequest("PATCH", "0", { name: "   " }), createContext("0"));

    await expect(response.json()).resolves.toEqual({ error: "Profile name is required" });
    expect(response.status).toBe(400);
  });

  it("renames the profile", async () => {
    mocks.state.currentViewer = viewer;
    mocks.state.profiles.set("user-1:map-1:0", {
      name: "Old",
      settings: { searchLinesEnabled: true },
      slot: 0,
      updatedAt: new Date()
    });

    const response = await PATCH(createJsonRequest("PATCH", "0", { name: "New" }), createContext("0"));

    await expect(response.json()).resolves.toMatchObject({
      profile: {
        name: "New",
        slot: 0
      }
    });
    expect(response.status).toBe(200);
    expect(mocks.state.profiles.get("user-1:map-1:0")).toMatchObject({
      name: "New",
      settings: { searchLinesEnabled: true }
    });
  });
});
