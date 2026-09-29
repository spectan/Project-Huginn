import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/http";
import type { SaveUserMapSettingsDependencies } from "@/lib/map-settings/map-settings-service";

const mocks = vi.hoisted(() => {
  const state = {
    currentViewer: null as null | {
      accessLevel: "READ";
      approvalStatus: "APPROVED";
      id: string;
      isAdmin: false;
      mapPermissions?: readonly [{ accessLevel: "READ"; isOperator: false; mapId: string }];
    },
    settings: new Map<string, unknown>()
  };

  const store: Pick<SaveUserMapSettingsDependencies, "findSettings" | "upsertSettings"> = {
    findSettings: vi.fn(async (userId, mapId) => {
      const saved = state.settings.get(`${userId}:${mapId}`);
      return saved === undefined ? null : { settings: saved };
    }),
    upsertSettings: vi.fn(async ({ mapId, settings, userId }) => {
      state.settings.set(`${userId}:${mapId}`, settings);
      return { settings };
    })
  };
  const dependencies: SaveUserMapSettingsDependencies = {
    findMap: vi.fn(async (mapId) => mapId === "map-1" ? { id: mapId } : null),
    findNoteCategoryIds: vi.fn(async () => ["cat-1"]),
    ...store,
    withSettingsLock: vi.fn(async (_input, work) => work(store)) as SaveUserMapSettingsDependencies["withSettingsLock"]
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
  createUserMapSettingsDependencies: vi.fn(() => mocks.dependencies)
}));

import { PATCH } from "./route";

describe("PATCH /api/maps/[mapId]/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.settings.clear();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await PATCH(createSettingsRequest({}), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("saves merged settings for the authenticated user", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ]
    };
    mocks.state.settings.set("user-1:map-1", {
      markerColors: {
        towers: "#00ff00"
      },
      tileHighlightPanelPosition: {
        left: 12,
        top: 34
      }
    });

    const response = await PATCH(createSettingsRequest({
      markerOpacities: {
        towers: 45
      }
    }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toMatchObject({
      settings: {
        markerColors: {
          towers: "#00ff00"
        },
        markerOpacities: {
          towers: 45
        },
        tileHighlightPanelPosition: {
          left: 12,
          top: 34
        }
      }
    });
    expect(response.status).toBe(200);
    expect(mocks.dependencies.withSettingsLock).toHaveBeenCalledWith(
      { mapId: "map-1", userId: "user-1" },
      expect.any(Function)
    );
  });

  it("returns 400 and stores nothing when the save exceeds the annotation cap", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-1" }
      ]
    };
    const annotations = Array.from({ length: 501 }, (_, index) => ({
      id: `a-${index}`,
      text: "",
      title: `Note ${index}`,
      x: index,
      y: index
    }));

    const response = await PATCH(createSettingsRequest({ annotations }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "A map can hold at most 500 annotations" });
    expect(mocks.state.settings.has("user-1:map-1")).toBe(false);
  });
});

const createSettingsRequest = (body: unknown) => jsonRequest("http://localhost/api/maps/map-1/settings", "PATCH", body);
