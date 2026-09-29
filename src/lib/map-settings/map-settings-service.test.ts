import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "./map-settings";
import {
  getUserMapSettings,
  listSettingsProfiles,
  loadSettingsProfile,
  renameSettingsProfile,
  saveSettingsProfile,
  saveUserMapSettings,
  type SaveUserMapSettingsDependencies,
  type SettingsProfilesDependencies
} from "./map-settings-service";

/** In-memory stand-in for the per-(user, map) transaction lock. */
function createLock(): SaveUserMapSettingsDependencies["withSettingsLock"] {
  const tails = new Map<string, Promise<unknown>>();

  return (input, work) => {
    const key = `${input.userId}:${input.mapId}`;
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.then(() => work(storeRef.current!));
    tails.set(key, run.catch(() => undefined));
    return run;
  };
}

/** Note category ids that exist on every test map. */
const noteCategoryIds: { current: string[] } = { current: [] };

// The lock hands `work` the dependencies' own store; set per factory call.
const storeRef: { current: Pick<SaveUserMapSettingsDependencies, "findSettings" | "upsertSettings"> | null } = {
  current: null
};

const readableActor = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ]
} as const;

const multiMapActor = {
  ...readableActor,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" },
    { accessLevel: "READ", isOperator: false, mapId: "map-2" }
  ]
} as const;

const blockedActor = {
  ...readableActor,
  accessLevel: "NONE",
  approvalStatus: "PENDING"
} as const;

function createDependencies(): SaveUserMapSettingsDependencies {
  const maps = new Set(["map-1"]);
  const settings = new Map<string, unknown>();
  const store: Pick<SaveUserMapSettingsDependencies, "findSettings" | "upsertSettings"> = {
    findSettings: async (userId, mapId) => {
      // Yield so unserialized concurrent saves would interleave.
      await new Promise((resolve) => setTimeout(resolve, 0));
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
  storeRef.current = store;

  return {
    findMap: async (mapId) => maps.has(mapId) ? { id: mapId } : null,
    findNoteCategoryIds: async () => noteCategoryIds.current,
    ...store,
    withSettingsLock: createLock()
  };
}

describe("user map settings service", () => {
  let dependencies: SaveUserMapSettingsDependencies;

  beforeEach(() => {
    noteCategoryIds.current = [];
    dependencies = createDependencies();
  });

  it("serializes concurrent saves so neither merge is lost", async () => {
    await Promise.all([
      saveUserMapSettings({
        actor: readableActor,
        input: { markerColors: { towers: "#00ff00" } },
        mapId: "map-1"
      }, dependencies),
      saveUserMapSettings({
        actor: readableActor,
        input: { searchLinesEnabled: true },
        mapId: "map-1"
      }, dependencies)
    ]);

    const result = await getUserMapSettings({ actor: readableActor, mapId: "map-1" }, dependencies);

    expect(result.ok && result.value.markerColors.towers).toBe("#00ff00");
    expect(result.ok && result.value.searchLinesEnabled).toBe(true);
  });

  it("drops style entries for note categories that no longer exist on save", async () => {
    noteCategoryIds.current = ["cat-live"];

    const result = await saveUserMapSettings({
      actor: readableActor,
      input: { noteCategoryColors: { "cat-gone": "#000000", "cat-live": "#ffffff" } },
      mapId: "map-1"
    }, dependencies);

    expect(result.ok && result.value.noteCategoryColors).toEqual({ "cat-live": "#ffffff" });
  });

  it("rejects a save over the annotation cap without storing it", async () => {
    const annotations = Array.from({ length: 501 }, (_, index) => ({
      id: `a-${index}`,
      text: "",
      title: `Note ${index}`,
      x: index,
      y: index
    }));

    const result = await saveUserMapSettings({
      actor: readableActor,
      input: { annotations, searchLinesEnabled: true },
      mapId: "map-1"
    }, dependencies);

    expect(result).toEqual({ ok: false, error: "A map can hold at most 500 annotations" });
    const stored = await getUserMapSettings({ actor: readableActor, mapId: "map-1" }, dependencies);
    expect(stored.ok && stored.value.searchLinesEnabled).toBe(false);
  });

  it("lets a user whose stored annotations already exceed the cap keep saving other settings", async () => {
    const annotations = Array.from({ length: 600 }, (_, index) => ({
      id: `a-${index}`,
      text: "",
      title: `Note ${index}`,
      type: "annotation" as const,
      x: index,
      y: index
    }));
    await dependencies.upsertSettings({
      mapId: "map-1",
      settings: { ...DEFAULT_USER_MAP_SETTINGS, annotations },
      userId: readableActor.id
    });

    const result = await saveUserMapSettings({
      actor: readableActor,
      input: { annotations, searchLinesEnabled: true },
      mapId: "map-1"
    }, dependencies);

    expect(result.ok && result.value.annotations).toHaveLength(600);
    expect(result.ok && result.value.searchLinesEnabled).toBe(true);
  });

  it("rejects style entries for more than 200 existing note categories", async () => {
    noteCategoryIds.current = Array.from({ length: 201 }, (_, index) => `cat-${index}`);

    const result = await saveUserMapSettings({
      actor: readableActor,
      input: {
        noteCategoryColors: Object.fromEntries(noteCategoryIds.current.map((id) => [id, "#abcdef"]))
      },
      mapId: "map-1"
    }, dependencies);

    expect(result.ok).toBe(false);
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

function createProfileDependencies(): SettingsProfilesDependencies & SaveUserMapSettingsDependencies & {
  profiles: Map<string, StoredProfile>;
} {
  const maps = new Set(["map-1", "map-2"]);
  const settings = new Map<string, unknown>();
  const profiles = new Map<string, StoredProfile>();
  const profileKey = (userId: string, slot: number) => `${userId}:${slot}`;
  const store: Pick<SaveUserMapSettingsDependencies, "findSettings" | "upsertSettings"> = {
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
  storeRef.current = store;

  return {
    findMap: async (mapId) => maps.has(mapId) ? { id: mapId } : null,
    findNoteCategoryIds: async () => noteCategoryIds.current,
    ...store,
    withSettingsLock: createLock(),
    findProfile: async (userId, slot) => profiles.get(profileKey(userId, slot)) ?? null,
    listProfiles: async (userId) => [...profiles.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, profile]) => profile),
    renameProfile: async ({ name, slot, userId }) => {
      const existing = profiles.get(profileKey(userId, slot));

      if (existing === undefined) {
        return null;
      }

      const renamed = {
        ...existing,
        name,
        updatedAt: new Date()
      };
      profiles.set(profileKey(userId, slot), renamed);
      return renamed;
    },
    upsertProfile: async ({ name, settings: profileSettings, slot, userId }) => {
      const saved: StoredProfile = {
        name,
        settings: profileSettings,
        slot,
        updatedAt: new Date()
      };
      profiles.set(profileKey(userId, slot), saved);
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

  it("reports whether a save created or overwrote the slot", async () => {
    const first = await saveSettingsProfile({ actor: readableActor, mapId: "map-1", slot: 1 }, dependencies);
    const second = await saveSettingsProfile({ actor: readableActor, mapId: "map-1", slot: 1 }, dependencies);

    expect(first.ok && first.value.created).toBe(true);
    expect(second.ok && second.value.created).toBe(false);
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
    dependencies.profiles.set("user-1:2", {
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
  it("shares profiles across every map the actor can read", async () => {
    await saveUserMapSettings({
      actor: multiMapActor,
      input: {
        markerColors: {
          towers: "#123456"
        }
      },
      mapId: "map-1"
    }, dependencies);
    await saveSettingsProfile({
      actor: multiMapActor,
      mapId: "map-1",
      name: "Everywhere",
      slot: 0
    }, dependencies);

    await expect(listSettingsProfiles({
      actor: multiMapActor,
      mapId: "map-2"
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: [{ name: "Everywhere", slot: 0 }]
    });
    await expect(loadSettingsProfile({
      actor: multiMapActor,
      mapId: "map-2",
      slot: 0
    }, dependencies)).resolves.toMatchObject({
      ok: true,
      value: {
        settings: {
          markerColors: {
            towers: "#123456"
          }
        }
      }
    });
  });

  it("does not capture map-specific annotations in profiles", async () => {
    await saveUserMapSettings({
      actor: readableActor,
      input: {
        annotations: [{
          id: "annotation-1",
          text: "Here",
          title: "Spot",
          type: "annotation",
          x: 10,
          y: 20
        }]
      },
      mapId: "map-1"
    }, dependencies);
    await saveSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 0
    }, dependencies);

    const loaded = await loadSettingsProfile({
      actor: readableActor,
      mapId: "map-1",
      slot: 0
    }, dependencies);

    expect(loaded.ok).toBe(true);

    if (loaded.ok) {
      expect(loaded.value.settings.annotations).toEqual([]);
    }
  });
});
