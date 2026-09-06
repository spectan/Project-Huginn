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
    profiles: new Map<string, { name: string; settings: unknown; slot: number; updatedAt: Date }>()
  };

  const dependencies: SettingsProfilesDependencies = {
    findMap: vi.fn(async (mapId) => mapId === "map-1" ? { id: mapId } : null),
    findSettings: vi.fn(async () => null),
    upsertSettings: vi.fn(async ({ settings }) => ({ settings })),
    findProfile: vi.fn(async (userId, mapId, slot) =>
      state.profiles.get(`${userId}:${mapId}:${slot}`) ?? null),
    listProfiles: vi.fn(async (userId, mapId) => [...state.profiles.entries()]
      .filter(([key]) => key.startsWith(`${userId}:${mapId}:`))
      .map(([, profile]) => profile)),
    renameProfile: vi.fn(async () => null),
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

import { GET } from "./route";

const viewer = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ]
} as const;

describe("GET /api/maps/[mapId]/settings/profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.profiles.clear();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user lacks map read access", async () => {
    mocks.state.currentViewer = {
      ...viewer,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "other-map" }
      ]
    };

    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Read access is required" });
    expect(response.status).toBe(403);
  });

  it("returns the user's profiles", async () => {
    mocks.state.currentViewer = viewer;
    mocks.state.profiles.set("user-1:map-1:0", {
      name: "Profile 1",
      settings: { searchLinesEnabled: true },
      slot: 0,
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    const response = await GET(new Request("http://localhost/api/maps/map-1/settings/profiles"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({
      profiles: [
        {
          name: "Profile 1",
          slot: 0,
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
    expect(response.status).toBe(200);
  });
});
