import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "./map-settings";
import {
  getUserMapSettings,
  listSettingsProfiles,
  loadSettingsProfile,
  renameSettingsProfile,
  saveSettingsProfile,
  saveUserMapSettings,
  type SettingsProfilesDependencies,
  type UserMapSettingsDependencies
} from "./map-settings-service";

const readableActor = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ]
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
      actor: {
        ...readableActor,
        mapPermissions: [
          ...readableActor.mapPermissions,
          { accessLevel: "READ", isOperator: false, mapId: "missing-map" }
        ]
      },
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

type StoredProfile = {
  name: string;
  settings: unknown;
  slot: number;
  updatedAt: Date;
};

function createProfileDependencies(): SettingsProfilesDependencies & {
  profiles: Map<string, StoredProfile>;
} {
  const maps = new Set(["map-1"]);
  const settings = new Map<string, unknown>();
  const profiles = new Map<string, StoredProfile>();
  const profileKey = (userId: string, mapId: string, slot: number) => `${userId}:${mapId}:${slot}`;

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
    },
    findProfile: async (userId, mapId, slot) => profiles.get(profileKey(userId, mapId, slot)) ?? null,
    listProfiles: async (userId, mapId) => [...profiles.entries()]
      .filter(([key]) => key.startsWith(`${userId}:${mapId}:`))
      .map(([, profile]) => profile),
    renameProfile: async ({ mapId, name, slot, userId }) => {
      const existing = profiles.get(profileKey(userId, mapId, slot));

      if (existing === undefined) {
        return null;
      }

      const renamed = {
        ...existing,
        name,
        updatedAt: new Date()
      };
      profiles.set(profileKey(userId, mapId, slot), renamed);
      return renamed;
    },
    upsertProfile: async ({ mapId, name, settings: profileSettings, slot, userId }) => {
      const saved: StoredProfile = {
        name,
        settings: profileSettings,
        slot,
        updatedAt: new Date()
      };
      profiles.set(profileKey(userId, mapId, slot), saved);
      return saved;
    },
    profiles
  };
}

describe("settings profiles service", () => {
  let dependencies: ReturnType<typeof createProfileDependencies>;

  beforeEach(() => {
    dependencies = createProfileDependencies();
  });

  it("lists profiles ordered by slot with metadata only", async () => {
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "Second",
      slot: 2
    }, dependencies);
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "First",
      slot: 0
    }, dependencies);

    const result = await listSettingsProfiles({
      actor: readableActor,
      mapId: "map-1"
    }, dependencies);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.map((profile) => profile.slot)).toEqual([0, 2]);
      expect(result.value.map((profile) => profile.name)).toEqual(["First", "Second"]);
      expect(result.value[0]).not.toHaveProperty("settings");
      expect(result.value[0]?.updatedAt).toBeInstanceOf(Date);
    }
  });

  it("rejects listing without map read access", async () => {
    await expect(listSettingsProfiles({
      actor: blockedActor,
      mapId: "map-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Read access is required"
    });
  });

  it.each([-1, 3, 1.5, Number.NaN])("rejects invalid slot %s on save", async (slot) => {
    await expect(saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Slot must be an integer between 0 and 2"
    });
  });

  it("rejects profile names longer than 40 characters", async () => {
    await expect(saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "x".repeat(41),
      slot: 0
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Profile name must be 40 characters or fewer"
    });
  });

  it("defaults the profile name when blank or missing", async () => {
    await expect(saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "   ",
      slot: 1
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "Profile 2",
        slot: 1
      }
    });

    await expect(saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 0
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "Profile 1",
        slot: 0
      }
    });
  });

  it("captures the actor's current settings and overwrites on repeated saves", async () => {
    await saveUserMapSettings({
      actor: readableActor,
      input: {
        markerColors: {
          towers: "#00ff00"
        }
      },
      mapId: "map-1"
    }, dependencies);
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "Setup",
      slot: 0
    }, dependencies);

    await saveUserMapSettings({
      actor: readableActor,
      input: {
        markerColors: {
          towers: "#ff0000"
        }
      },
      mapId: "map-1"
    }, dependencies);
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "Setup",
      slot: 0
    }, dependencies);

    expect(dependencies.profiles.size).toBe(1);
    await expect(loadSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 0
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "Setup",
        settings: {
          markerColors: {
            towers: "#ff0000"
          }
        },
        slot: 0
      }
    });
  });

  it("fails to load a missing profile", async () => {
    await expect(loadSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 1
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Profile was not found"
    });
  });

  it("normalizes stored profile settings on load", async () => {
    dependencies.profiles.set("user-1:map-1:2", {
      name: "Messy",
      settings: {
        markerOpacities: {
          towers: 400
        },
        searchLinesEnabled: "yes"
      },
      slot: 2,
      updatedAt: new Date()
    });

    await expect(loadSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 2
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "Messy",
        settings: {
          markerOpacities: {
            towers: 100
          },
          searchLinesEnabled: false
        },
        slot: 2
      }
    });
  });

  it("rejects loading without map read access", async () => {
    await expect(loadSettingsProfile({
      actor: blockedActor,
      mapId: "map-1",
      slot: 0
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Read access is required"
    });
  });

  it("fails to rename a missing profile", async () => {
    await expect(renameSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "New name",
      slot: 0
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Profile was not found"
    });
  });

  it.each(["", "   ", "x".repeat(41)])("rejects invalid rename name %j", async (name) => {
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 0
    }, dependencies);

    const result = await renameSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name,
      slot: 0
    }, dependencies);

    expect(result.ok).toBe(false);
  });

  it("renames an existing profile", async () => {
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "Old",
      slot: 1
    }, dependencies);

    await expect(renameSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      name: "  New name  ",
      slot: 1
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "New name",
        slot: 1
      }
    });

    await expect(loadSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 1
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        name: "New name"
      }
    });
  });

  it("rejects renaming without map read access", async () => {
    await expect(renameSettingsProfile({
      actor: blockedActor,
      mapId: "map-1",
      name: "New name",
      slot: 0
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Read access is required"
    });
  });
});
