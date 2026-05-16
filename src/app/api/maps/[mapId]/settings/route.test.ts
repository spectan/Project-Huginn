import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserMapSettingsDependencies } from "@/lib/map-settings/map-settings-service";

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

  const dependencies: UserMapSettingsDependencies = {
    findMap: vi.fn(async (mapId) => mapId === "map-1" ? { id: mapId } : null),
    findSettings: vi.fn(async (userId, mapId) => {
      const saved = state.settings.get(`${userId}:${mapId}`);
      return saved === undefined ? null : { settings: saved };
    }),
    upsertSettings: vi.fn(async ({ mapId, settings, userId }) => {
      state.settings.set(`${userId}:${mapId}`, settings);
      return { settings };
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
  });
});

function createSettingsRequest(body: unknown): Request {
  return new Request("http://localhost/api/maps/map-1/settings", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method: "PATCH"
  });
}
