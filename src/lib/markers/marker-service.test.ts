import { beforeEach, describe, expect, it } from "vitest";
import {
  createMarker,
  deleteMarker,
  disbandDeedMarker,
  type MarkerServiceDependencies,
  listMarkers,
  updateMarker
} from "./marker-service";

const writer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "map-1" }
  ],
  username: "Writer"
} as const;

const reader = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "reader-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ],
  username: "Reader"
} as const;

const scopedWriter = {
  accessLevel: "NONE",
  approvalStatus: "APPROVED",
  id: "scoped-writer-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "map-1" }
  ],
  username: "Scoped Writer"
} as const;

function createDependencies(): MarkerServiceDependencies & { auditEvents: unknown[] } {
  type ModifierFields = {
    createdBy?: { username: string } | null;
    createdByUserId?: string;
    updatedBy?: { username: string } | null;
    updatedByUserId?: string;
  };
  const usersById = new Map<string, string>([
    [writer.id, writer.username],
    [reader.id, reader.username],
    [scopedWriter.id, scopedWriter.username]
  ]);
  const userSummary = (userId: string | undefined) => (
    userId === undefined ? null : { username: usersById.get(userId) ?? "Unknown" }
  );
  const withModifierUsers = <T extends ModifierFields>(record: T): T => ({
    ...record,
    createdBy: userSummary(record.createdByUserId),
    updatedBy: userSummary(record.updatedByUserId)
  });
  const mapLayers = [
    {
      heightPx: 2048,
      id: "layer-terrain",
      imagePath: "/maps/wurm-map.png",
      isDefault: true,
      name: "Terrain",
      sortOrder: 0,
      widthPx: 2048
    },
    {
      heightPx: 2048,
      id: "layer-topographical",
      imagePath: "/maps/celebration-topo.png",
      isDefault: false,
      name: "Topographical",
      sortOrder: 1,
      widthPx: 2048
    }
  ];
  const createMapRecord = (mapId: string) => ({
    heightPx: 2048,
    id: mapId,
    imagePath: "/maps/wurm-map.png",
    layers: mapLayers,
    name: "Celebration",
    widthPx: 2048
  });
  const towers = new Map<string, ModifierFields & {
    damageHundredths: number | null;
    id: string;
    makerName: string;
    makerNumber: string;
    mapId: string;
    planned: boolean;
    qlHundredths: number | null;
    towerType: "Freedom Isles" | "Horde of the Summoned" | "Jenn-Kellon" | "Mol-Rehan";
    x: number;
    y: number;
  }>();
  const notes = new Map<string, ModifierFields & {
    category: string;
    id: string;
    mapId: string;
    text: string;
    title: string;
    x: number;
    y: number;
  }>();
  const noteCategories = new Map<string, {
    color: string | null;
    id: string;
    markerShape: string;
    mapId: string;
    name: string;
    pipSize: number;
  }>();
  const rifts = new Map<string, ModifierFields & {
    arrivalDate: Date | null;
    estimatedRiftTime: Date | null;
    id: string;
    mapId: string;
    notes: string;
    x: number;
    y: number;
  }>();
  const camps = new Map<string, ModifierFields & {
    campType: "Rift" | "Goblin";
    id: string;
    mapId: string;
    notes: string;
    x: number;
    y: number;
  }>();
  const minedoors = new Map<string, ModifierFields & {
    id: string;
    mapId: string;
    notes: string;
    strength: string;
    x: number;
    y: number;
  }>();
  const locateSouls = new Map<string, ModifierFields & {
    casterFacing: "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";
    direction: "ahead" | "aheadRight" | "right" | "behindRight" | "behind" | "behindLeft" | "left" | "aheadLeft";
    distanceBand: "0" | "1-3" | "4-5" | "6-9" | "10-19" | "20-49" | "50-199" | "200-499" | "500-999" | "1000+" | "2000+";
    id: string;
    mapId: string;
    notes: string;
    targetName: string;
    x: number;
    y: number;
  }>();
  const paths = new Map<string, ModifierFields & {
    id: string;
    mapId: string;
    name: string;
    notes: string;
    pathType: "bridge" | "canal" | "highway";
    points: Array<{ x: number; y: number }>;
    width: number;
    x: number;
    y: number;
  }>();
  const deeds = new Map<string, ModifierFields & {
    east: number;
    foundingDate: Date | null;
    founder: string;
    id: string;
    mapId: string;
    name: string;
    north: number;
    perimeter: number;
    south: number;
    west: number;
    x: number;
    y: number;
  }>();
  let towerCount = 0;
  let noteCount = 0;
  let noteCategoryCount = 0;
  let deedCount = 0;
  let riftCount = 0;
  let campCount = 0;
  let minedoorCount = 0;
  let locateSoulCount = 0;
  let pathCount = 0;
  const auditEvents: unknown[] = [];

  return {
    auditEvents,
    createLocateSoul: async (data) => {
      locateSoulCount += 1;
      const locateSoul = withModifierUsers({ ...data, id: `locate-soul-${locateSoulCount}` });
      locateSouls.set(locateSoul.id, locateSoul);
      return locateSoul;
    },
    createPath: async (data) => {
      pathCount += 1;
      const path = withModifierUsers({ ...data, id: `path-${pathCount}` });
      paths.set(path.id, path);
      return path;
    },
    createCamp: async (data) => {
      campCount += 1;
      const camp = withModifierUsers({ ...data, id: `camp-${campCount}` });
      camps.set(camp.id, camp);
      return camp;
    },
    createDeed: async (data) => {
      deedCount += 1;
      const deed = withModifierUsers({ ...data, id: `deed-${deedCount}` });
      deeds.set(deed.id, deed);
      return deed;
    },
    createNote: async (data) => {
      noteCount += 1;
      const note = withModifierUsers({ ...data, id: `note-${noteCount}` });
      notes.set(note.id, note);
      return note;
    },
    createMinedoor: async (data) => {
      minedoorCount += 1;
      const minedoor = withModifierUsers({ ...data, id: `minedoor-${minedoorCount}` });
      minedoors.set(minedoor.id, minedoor);
      return minedoor;
    },
    createRift: async (data) => {
      riftCount += 1;
      const rift = withModifierUsers({ ...data, id: `rift-${riftCount}` });
      rifts.set(rift.id, rift);
      return rift;
    },
    createTower: async (data) => {
      towerCount += 1;
      const tower = withModifierUsers({ ...data, id: `tower-${towerCount}` });
      towers.set(tower.id, tower);
      return tower;
    },
    disbandDeed: async (input) => {
      const deed = deeds.get(input.deedId);

      if (deed === undefined) {
        return null;
      }

      const existingCategory = Array.from(noteCategories.values()).find((category) => (
        category.mapId === deed.mapId && category.name === input.categoryName
      ));
      const category = existingCategory ?? {
        color: null,
        id: `category-${noteCategoryCount + 1}`,
        markerShape: "circle",
        mapId: deed.mapId,
        name: input.categoryName,
        pipSize: 3
      };

      if (existingCategory === undefined) {
        noteCategoryCount += 1;
        noteCategories.set(category.id, category);
      }

      noteCount += 1;
      const note = withModifierUsers({ ...input.note, id: `note-${noteCount}` });
      notes.set(note.id, note);
      deeds.delete(input.deedId);

      return {
        category,
        deletedDeed: deed,
        note
      };
    },
    findDeed: async (id) => {
      const deed = deeds.get(id);
      return deed === undefined
        ? null
        : {
            ...deed,
            map: {
              ...createMapRecord(deed.mapId)
            }
          };
    },
    findCamp: async (id) => {
      const camp = camps.get(id);
      return camp === undefined
        ? null
        : {
            ...camp,
            map: {
              ...createMapRecord(camp.mapId)
            }
          };
    },
    findMap: async (mapId) => createMapRecord(mapId),
    findNote: async (id) => {
      const note = notes.get(id);
      return note === undefined
        ? null
        : {
            ...note,
            map: {
              ...createMapRecord(note.mapId)
            }
          };
    },
    findMinedoor: async (id) => {
      const minedoor = minedoors.get(id);
      return minedoor === undefined
        ? null
        : {
            ...minedoor,
            map: {
              ...createMapRecord(minedoor.mapId)
            }
          };
    },
    findLocateSoul: async (id) => {
      const locateSoul = locateSouls.get(id);
      return locateSoul === undefined
        ? null
        : {
            ...locateSoul,
            map: {
              ...createMapRecord(locateSoul.mapId)
            }
          };
    },
    findRift: async (id) => {
      const rift = rifts.get(id);
      return rift === undefined
        ? null
        : {
            ...rift,
            map: {
              ...createMapRecord(rift.mapId)
            }
          };
    },
    findTower: async (id) => {
      const tower = towers.get(id);
      return tower === undefined
        ? null
        : {
            ...tower,
            map: {
              ...createMapRecord(tower.mapId)
            }
          };
    },
    findPath: async (id) => {
      const path = paths.get(id);
      return path === undefined
        ? null
        : {
            ...path,
            map: {
              ...createMapRecord(path.mapId)
            }
          };
    },
    listActiveMarkers: async (mapId) => ({
      camps: Array.from(camps.values()).filter((camp) => camp.mapId === mapId),
      deeds: Array.from(deeds.values()).filter((deed) => deed.mapId === mapId),
      locateSouls: Array.from(locateSouls.values()).filter((locateSoul) => locateSoul.mapId === mapId),
      minedoors: Array.from(minedoors.values()).filter((minedoor) => minedoor.mapId === mapId),
      notes: Array.from(notes.values()).filter((note) => note.mapId === mapId),
      paths: Array.from(paths.values()).filter((path) => path.mapId === mapId),
      rifts: Array.from(rifts.values()).filter((rift) => rift.mapId === mapId),
      towers: Array.from(towers.values()).filter((tower) => tower.mapId === mapId)
    }),
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    recordAudit: async (input) => {
      auditEvents.push(input);
    },
    softDeleteCamp: async (id) => {
      const camp = camps.get(id);
      camps.delete(id);
      return camp ?? null;
    },
    softDeleteDeed: async (id) => {
      const deed = deeds.get(id);
      deeds.delete(id);
      return deed ?? null;
    },
    softDeleteNote: async (id) => {
      const note = notes.get(id);
      notes.delete(id);
      return note ?? null;
    },
    softDeleteMinedoor: async (id) => {
      const minedoor = minedoors.get(id);
      minedoors.delete(id);
      return minedoor ?? null;
    },
    softDeleteLocateSoul: async (id) => {
      const locateSoul = locateSouls.get(id);
      locateSouls.delete(id);
      return locateSoul ?? null;
    },
    softDeletePath: async (id) => {
      const path = paths.get(id);
      paths.delete(id);
      return path ?? null;
    },
    softDeleteRift: async (id) => {
      const rift = rifts.get(id);
      rifts.delete(id);
      return rift ?? null;
    },
    softDeleteTower: async (id) => {
      const tower = towers.get(id);
      towers.delete(id);
      return tower ?? null;
    },
    updateDeed: async (id, data) => {
      const existing = deeds.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      deeds.set(id, updated);
      return updated;
    },
    updateCamp: async (id, data) => {
      const existing = camps.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      camps.set(id, updated);
      return updated;
    },
    updateMinedoor: async (id, data) => {
      const existing = minedoors.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      minedoors.set(id, updated);
      return updated;
    },
    updateLocateSoul: async (id, data) => {
      const existing = locateSouls.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      locateSouls.set(id, updated);
      return updated;
    },
    updateNote: async (id, data) => {
      const existing = notes.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      notes.set(id, updated);
      return updated;
    },
    updatePath: async (id, data) => {
      const existing = paths.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      paths.set(id, updated);
      return updated;
    },
    updateRift: async (id, data) => {
      const existing = rifts.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      rifts.set(id, updated);
      return updated;
    },
    updateTower: async (id, data) => {
      const existing = towers.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = withModifierUsers({ ...existing, ...data });
      towers.set(id, updated);
      return updated;
    }
  };
}

describe("marker service", () => {
  let deps: MarkerServiceDependencies & { auditEvents: unknown[] };

  beforeEach(() => {
    deps = createDependencies();
  });

  it("creates a tower marker for approved writers", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        damage: "0.25",
        makerName: "Mako",
        makerNumber: "945",
        planned: true,
        ql: "89.50",
        towerType: "Jenn-Kellon",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        damage: "0.25",
        id: "tower-1",
        lastModifiedBy: "Writer",
        makerName: "Mako",
        makerNumber: "945",
        planned: true,
        ql: "89.50",
        towerType: "Jenn-Kellon",
        type: "tower",
        x: 25,
        y: 30
      }
    });
  });

  it("creates markers for users with write access on the target map", async () => {
    const result = await createMarker({
      actor: scopedWriter,
      input: {
        damage: "0.25",
        makerName: "Mako",
        makerNumber: "945",
        planned: false,
        ql: "89.50",
        towerType: "Freedom Isles",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(result).toMatchObject({
      ok: true,
      value: {
        lastModifiedBy: "Scoped Writer",
        type: "tower"
      }
    });
  });

  it("creates a planned tower marker without detail fields", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        damage: "",
        makerName: "",
        makerNumber: "",
        planned: true,
        ql: "",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        damage: "",
        id: "tower-1",
        lastModifiedBy: "Writer",
        makerName: "",
        makerNumber: "",
        planned: true,
        ql: "",
        towerType: "Freedom Isles",
        type: "tower",
        x: 25,
        y: 30
      }
    });
  });

  it("blocks read-only users from creating markers", async () => {
    const result = await createMarker({
      actor: reader,
      input: {
        category: "Landmarks",
        text: "Scout here",
        title: "Mine entrance",
        type: "note",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: false,
      error: "Write access is required"
    });
  });

  it("creates a note marker with optional text", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        category: "Landmarks",
        text: "",
        title: "Mine entrance",
        type: "note",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        category: "Landmarks",
        id: "note-1",
        lastModifiedBy: "Writer",
        text: "",
        title: "Mine entrance",
        type: "note",
        x: 25,
        y: 30
      }
    });
  });

  it("creates a centered deed marker with directional dimensions", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        east: 7,
        foundingDate: "2026-05-10",
        founder: "Founder",
        name: "Oak Harbour",
        north: 5,
        perimeter: 5,
        south: 8,
        type: "deed",
        west: 6,
        x: 100,
        y: 120
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        east: 7,
        foundingDate: "2026-05-10",
        founder: "Founder",
        id: "deed-1",
        lastModifiedBy: "Writer",
        name: "Oak Harbour",
        north: 5,
        perimeter: 5,
        south: 8,
        type: "deed",
        west: 6,
        x: 100,
        y: 120
      }
    });
  });

  it("creates a rift marker with optional dates and notes", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        arrivalDate: "2026-05-10",
        estimatedRiftTime: "2026-05-10T18:30",
        notes: "Bring cotton",
        type: "rift",
        x: 100,
        y: 120
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        arrivalDate: "2026-05-10",
        estimatedRiftTime: "2026-05-10T18:30",
        id: "rift-1",
        lastModifiedBy: "Writer",
        notes: "Bring cotton",
        type: "rift",
        x: 100,
        y: 120
      }
    });
  });

  it("creates a camp marker with a required camp type and optional notes", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        campType: "Goblin",
        notes: "",
        type: "camp",
        x: 100,
        y: 120
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        campType: "Goblin",
        id: "camp-1",
        lastModifiedBy: "Writer",
        notes: "",
        type: "camp",
        x: 100,
        y: 120
      }
    });
  });

  it("creates a minedoor marker with optional strength and notes", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        notes: "Hidden entrance",
        strength: "73ql",
        type: "minedoor",
        x: 100,
        y: 120
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        id: "minedoor-1",
        lastModifiedBy: "Writer",
        notes: "Hidden entrance",
        strength: "73ql",
        type: "minedoor",
        x: 100,
        y: 120
      }
    });
  });

  it("creates a locate soul marker with a 3 by 3 pip and overlay inputs", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        casterFacing: "north",
        direction: "aheadLeft",
        distanceBand: "50-199",
        notes: "Corpse result",
        targetName: "Funkiey",
        type: "locateSoul",
        x: 100,
        y: 120
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        casterFacing: "north",
        direction: "aheadLeft",
        distanceBand: "50-199",
        id: "locate-soul-1",
        lastModifiedBy: "Writer",
        notes: "Corpse result",
        targetName: "Funkiey",
        type: "locateSoul",
        x: 100,
        y: 120
      }
    });
  });

  it("creates an infrastructure path for approved writers", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        name: "Cedar Bridge",
        notes: "Two lanes",
        points: [
          { x: 100, y: 120 },
          { x: 105, y: 120 },
          { x: 110, y: 122 }
        ],
        type: "bridge",
        width: 2
      },
      mapId: "map-1"
    }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        id: "path-1",
        lastModifiedBy: "Writer",
        name: "Cedar Bridge",
        notes: "Two lanes",
        points: [
          { x: 100, y: 120 },
          { x: 105, y: 120 },
          { x: 110, y: 122 }
        ],
        type: "bridge",
        width: 2,
        x: 100,
        y: 120
      }
    });
  });

  it("lists active markers formatted for the client", async () => {
    await createMarker({
      actor: writer,
      input: {
        damage: "0.25",
        makerName: "Mako",
        makerNumber: "945",
        ql: "89.50",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    const result = await listMarkers({ actor: reader, mapId: "map-1" }, deps);

    expect(result).toEqual({
      ok: true,
      value: {
        markers: [
          {
            damage: "0.25",
            id: "tower-1",
            lastModifiedBy: "Writer",
            makerName: "Mako",
            makerNumber: "945",
            planned: false,
            ql: "89.50",
            towerType: "Freedom Isles",
            type: "tower",
            x: 25,
            y: 30
          }
        ],
        map: {
          heightPx: 2048,
          id: "map-1",
          imageSrc: "/maps/wurm-map.png",
          layers: [
            {
              heightPx: 2048,
              id: "layer-terrain",
              imageSrc: "/maps/wurm-map.png",
              isDefault: true,
              name: "Terrain",
              widthPx: 2048
            },
            {
              heightPx: 2048,
              id: "layer-topographical",
              imageSrc: "/maps/celebration-topo.png",
              isDefault: false,
              name: "Topographical",
              widthPx: 2048
            }
          ],
          name: "Celebration",
          widthPx: 2048
        }
      }
    });
    expect(deps.auditEvents).not.toContainEqual(expect.objectContaining({
      action: "MARKER_LIST_VIEW"
    }));
  });

  it("updates existing notes with validation", async () => {
    const created = await createMarker({
      actor: writer,
      input: {
        category: "Landmarks",
        text: "Scout here",
        title: "Mine entrance",
        type: "note",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const updated = await updateMarker({
      actor: writer,
      input: {
        category: "Landmarks",
        text: "Updated note",
        title: "Updated title",
        type: "note",
        x: 26,
        y: 31
      },
      markerId: created.value.id,
      markerType: "note"
    }, deps);

    expect(updated).toEqual({
      ok: true,
      value: {
        category: "Landmarks",
        id: "note-1",
        lastModifiedBy: "Writer",
        text: "Updated note",
        title: "Updated title",
        type: "note",
        x: 26,
        y: 31
      }
    });
  });

  it("soft deletes markers for approved writers", async () => {
    await createMarker({
      actor: writer,
      input: {
        damage: "0.25",
        makerName: "Mako",
        makerNumber: "945",
        ql: "89.50",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);

    const deleted = await deleteMarker({
      actor: writer,
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(deleted).toEqual({
      ok: true,
      value: {
        deletedAt: new Date("2026-05-10T00:00:00.000Z"),
        deleteExpiresAt: new Date("2026-05-13T00:00:00.000Z"),
        markerId: "tower-1",
        markerType: "tower"
      }
    });
  });

  it("disbands a deed into an abandoned deed note with deed details", async () => {
    const created = await createMarker({
      actor: writer,
      input: {
        east: 6,
        foundingDate: "2026-05-09",
        founder: "Mayor Mako",
        name: "Oak Harbour",
        north: 4,
        perimeter: 8,
        south: 7,
        type: "deed",
        west: 5,
        x: 500,
        y: 600
      },
      mapId: "map-1"
    }, deps);

    expect(created.ok).toBe(true);

    if (!created.ok || created.value.type !== "deed") {
      return;
    }

    const result = await disbandDeedMarker({
      actor: writer,
      markerId: created.value.id
    }, deps);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.deletedMarkerId).toBe(created.value.id);
    expect(result.value.category).toEqual({
      color: null,
      id: "category-1",
      markerShape: "circle",
      name: "Abandoned Deed",
      pipSize: 3
    });
    expect(result.value.marker).toMatchObject({
      category: "Abandoned Deed",
      lastModifiedBy: "Writer",
      title: "Oak Harbour",
      type: "note",
      x: 500,
      y: 600
    });
    expect(result.value.marker.text).toContain("Former deed: Oak Harbour");
    expect(result.value.marker.text).toContain("Mayor: Mayor Mako");
    expect(result.value.marker.text).toContain("Founding date: 2026-05-09");
    expect(result.value.marker.text).toContain("Dimensions: N4 W5 E6 S7");
    expect(result.value.marker.text).toContain("Perimeter: 8 tiles");

    const listed = await listMarkers({ actor: writer, mapId: "map-1" }, deps);
    expect(listed.ok).toBe(true);

    if (!listed.ok) {
      return;
    }

    expect(listed.value.markers.some((marker) => marker.id === created.value.id)).toBe(false);
    expect(listed.value.markers).toContainEqual(result.value.marker);
  });
});
