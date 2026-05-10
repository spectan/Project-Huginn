import { beforeEach, describe, expect, it } from "vitest";
import {
  createMarker,
  deleteMarker,
  type MarkerServiceDependencies,
  listMarkers,
  updateMarker
} from "./marker-service";

const writer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false
} as const;

const reader = {
  accessLevel: "READ",
  approvalStatus: "APPROVED",
  id: "reader-id",
  isAdmin: false
} as const;

function createDependencies(): MarkerServiceDependencies {
  const towers = new Map<string, {
    damageHundredths: number;
    id: string;
    makerName: string;
    makerNumber: string;
    mapId: string;
    qlHundredths: number;
    x: number;
    y: number;
  }>();
  const notes = new Map<string, {
    category: string;
    id: string;
    mapId: string;
    text: string;
    title: string;
    x: number;
    y: number;
  }>();
  const deeds = new Map<string, {
    east: number;
    founder: string;
    id: string;
    mapId: string;
    name: string;
    north: number;
    south: number;
    west: number;
    x: number;
    y: number;
  }>();
  let towerCount = 0;
  let noteCount = 0;
  let deedCount = 0;

  return {
    createDeed: async (data) => {
      deedCount += 1;
      const deed = { ...data, id: `deed-${deedCount}` };
      deeds.set(deed.id, deed);
      return deed;
    },
    createNote: async (data) => {
      noteCount += 1;
      const note = { ...data, id: `note-${noteCount}` };
      notes.set(note.id, note);
      return note;
    },
    createTower: async (data) => {
      towerCount += 1;
      const tower = { ...data, id: `tower-${towerCount}` };
      towers.set(tower.id, tower);
      return tower;
    },
    findDeed: async (id) => {
      const deed = deeds.get(id);
      return deed === undefined
        ? null
        : {
            ...deed,
            map: {
              heightPx: 2048,
              id: deed.mapId,
              imagePath: "/maps/wurm-map.png",
              name: "Wurm",
              widthPx: 2048
            }
          };
    },
    findMap: async (mapId) => ({
      heightPx: 2048,
      id: mapId,
      imagePath: "/maps/wurm-map.png",
      name: "Wurm",
      widthPx: 2048
    }),
    findNote: async (id) => {
      const note = notes.get(id);
      return note === undefined
        ? null
        : {
            ...note,
            map: {
              heightPx: 2048,
              id: note.mapId,
              imagePath: "/maps/wurm-map.png",
              name: "Wurm",
              widthPx: 2048
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
              heightPx: 2048,
              id: tower.mapId,
              imagePath: "/maps/wurm-map.png",
              name: "Wurm",
              widthPx: 2048
            }
          };
    },
    listActiveMarkers: async (mapId) => ({
      deeds: Array.from(deeds.values()).filter((deed) => deed.mapId === mapId),
      notes: Array.from(notes.values()).filter((note) => note.mapId === mapId),
      towers: Array.from(towers.values()).filter((tower) => tower.mapId === mapId)
    }),
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    recordAudit: async () => undefined,
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

      const updated = { ...existing, ...data };
      deeds.set(id, updated);
      return updated;
    },
    updateNote: async (id, data) => {
      const existing = notes.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = { ...existing, ...data };
      notes.set(id, updated);
      return updated;
    },
    updateTower: async (id, data) => {
      const existing = towers.get(id);

      if (existing === undefined) {
        return null;
      }

      const updated = { ...existing, ...data };
      towers.set(id, updated);
      return updated;
    }
  };
}

describe("marker service", () => {
  let deps: MarkerServiceDependencies;

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
        ql: "89.50",
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
        makerName: "Mako",
        makerNumber: "945",
        ql: "89.50",
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

  it("creates a centered deed marker with directional dimensions", async () => {
    const result = await createMarker({
      actor: writer,
      input: {
        east: 7,
        founder: "Founder",
        name: "Oak Harbour",
        north: 5,
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
        founder: "Founder",
        id: "deed-1",
        name: "Oak Harbour",
        north: 5,
        south: 8,
        type: "deed",
        west: 6,
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
            makerName: "Mako",
            makerNumber: "945",
            ql: "89.50",
            type: "tower",
            x: 25,
            y: 30
          }
        ],
        map: {
          heightPx: 2048,
          id: "map-1",
          imageSrc: "/maps/wurm-map.png",
          name: "Wurm",
          widthPx: 2048
        }
      }
    });
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
});
