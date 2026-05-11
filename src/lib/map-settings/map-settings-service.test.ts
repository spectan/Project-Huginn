import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "./map-settings";
import {
  getUserMapSettings,
  saveUserMapSettings,
  type UserMapSettingsDependencies
} from "./map-settings-service";

const readableActor = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false
} as const;

const blockedActor = {
  ...readableActor,
  accessLevel: "NONE",
  approvalStatus: "PENDING"
} as const;

function createDependencies(): UserMapSettingsDependencies {
  const maps = new Set(["map-1"]);
  const settings = new Map<string, unknown>();

  return {
    findMap: async (mapId) => maps.has(mapId) ? { id: mapId } : null,
    findSettings: async (userId, mapId) => {
      const saved = settings.get(`${userId}:${mapId}`);
      return saved === undefined ? null : { settings: saved };
    },
    upsertSettings: async ({ mapId, settings: nextSettings, userId }) => {
      settings.set(`${userId}:${mapId}`, nextSettings);
      return {
        settings: nextSettings
      };
    }
  };
}

describe("user map settings service", () => {
  let dependencies: UserMapSettingsDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("returns defaults when the user has no saved settings", async () => {
    await expect(getUserMapSettings({
      actor: readableActor,
      mapId: "map-1"
    }, dependencies)).resolves.toEqual({
      ok: true,
      value: DEFAULT_USER_MAP_SETTINGS
    });
  });

  it("rejects users without map read access", async () => {
    await expect(saveUserMapSettings({
      actor: blockedActor,
      input: {
        markerColors: {
          towers: "#00ff00"
        }
      },
      mapId: "map-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Read access is required"
    });
  });

  it("rejects missing maps", async () => {
    await expect(getUserMapSettings({
      actor: readableActor,
      mapId: "missing-map"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Map was not found"
    });
  });

  it("upserts merged settings for a readable user", async () => {
    const first = await saveUserMapSettings({
      actor: readableActor,
      input: {
        markerColors: {
          towers: "#00ff00"
        },
        tileHighlightPanelPosition: {
          left: 30,
          top: 45
        }
      },
      mapId: "map-1"
    }, dependencies);

    expect(first).toMatchObject({
      ok: true,
      value: {
        markerColors: {
          towers: "#00ff00"
        },
        tileHighlightPanelPosition: {
          left: 30,
          top: 45
        }
      }
    });

    await expect(saveUserMapSettings({
      actor: readableActor,
      input: {
        markerOpacities: {
          towers: 40
        }
      },
      mapId: "map-1"
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        markerColors: {
          towers: "#00ff00"
        },
        markerOpacities: {
          towers: 40
        },
        tileHighlightPanelPosition: {
          left: 30,
          top: 45
        }
      }
    });
  });
});
