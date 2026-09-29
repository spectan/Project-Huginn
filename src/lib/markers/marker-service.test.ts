import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANARY_MARKERS_PER_MAP } from "@/lib/canaries/canary-service";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn(),
  dispatchDiscordNotification: vi.fn(async () => ({ ok: true as const, value: null }))
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

vi.mock("@/lib/discord/discord-service", () => ({
  dispatchDiscordNotification: mocks.dispatchDiscordNotification
}));

vi.mock("@/lib/discord/database", () => ({
  createDiscordDependencies: vi.fn(() => ({}))
}));

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

type MarkerStores = MarkerServiceDependencies["markers"];
type CreateData<K extends keyof MarkerStores> = Parameters<MarkerStores[K]["create"]>[0];

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
  // In-memory store for one marker table; ids are `${prefix}-${n}`.
  const createStore = <D extends ModifierFields & { mapId: string }>(prefix: string) => {
    type StoredRecord = D & ModifierFields & { id: string };
    const records = new Map<string, StoredRecord>();
    let count = 0;

    return {
      create: async (data: D): Promise<StoredRecord> => {
        count += 1;
        const record = withModifierUsers({ ...data, id: `${prefix}-${count}` });
        records.set(record.id, record);
        return record;
      },
      find: async (id: string) => {
        const record = records.get(id);
        return record === undefined ? null : { ...record, map: createMapRecord(record.mapId) };
      },
      listActive: async (mapId: string) => Array.from(records.values()).filter((record) => record.mapId === mapId),
      records,
      softDelete: async (id: string) => {
        const record = records.get(id);
        records.delete(id);
        return record ?? null;
      },
      update: async (id: string, data: Partial<D>) => {
        const existing = records.get(id);

        if (existing === undefined) {
          return null;
        }

        const updated = withModifierUsers({ ...existing, ...data });
        records.set(id, updated);
        return updated;
      }
    };
  };
  const markers = {
    camp: createStore<CreateData<"camp">>("camp"),
    deed: createStore<CreateData<"deed">>("deed"),
    locateSoul: createStore<CreateData<"locateSoul">>("locate-soul"),
    minedoor: createStore<CreateData<"minedoor">>("minedoor"),
    note: createStore<CreateData<"note">>("note"),
    path: createStore<CreateData<"path">>("path"),
    rift: createStore<CreateData<"rift">>("rift"),
    tower: createStore<CreateData<"tower">>("tower")
  };
  const noteCategories = new Map<string, {
    color: string | null;
    id: string;
    markerShape: string;
    mapId: string;
    name: string;
    pipSize: number;
  }>();
  const canaries = new Map<string, {
    id: string;
    mapId: string;
    payload: unknown;
    slot: number;
    userId: string;
  }>();
  let canaryCount = 0;
  const auditEvents: unknown[] = [];

  return {
    auditEvents,
    createCanaryMarkers: async ({ mapId, markers: canaryMarkers, userId }) => canaryMarkers.map((marker) => {
      canaryCount += 1;
      const record = {
        id: `canary-${canaryCount}`,
        mapId,
        payload: marker.payload,
        slot: marker.slot,
        userId
      };
      canaries.set(record.id, record);
      return record;
    }),
    disbandDeed: async (input) => {
      const deed = markers.deed.records.get(input.deedId);

      if (deed === undefined) {
        return null;
      }

      const existingCategory = Array.from(noteCategories.values()).find((category) => (
        category.mapId === deed.mapId && category.name === input.categoryName
      ));
      const category = existingCategory ?? {
        color: null,
        id: `category-${noteCategories.size + 1}`,
        markerShape: "circle",
        mapId: deed.mapId,
        name: input.categoryName,
        pipSize: 3
      };

      noteCategories.set(category.id, category);
      const note = await markers.note.create(input.note);
      markers.deed.records.delete(input.deedId);

      return {
        category,
        deletedDeed: deed,
        note
      };
    },
    findMap: async (mapId) => createMapRecord(mapId),
    listCanaryMarkers: async ({ mapId, userId }) => (
      Array.from(canaries.values())
        .filter((canary) => canary.mapId === mapId && canary.userId === userId)
        .sort((a, b) => a.slot - b.slot)
    ),
    markers,
    noteCategoryExists: async (mapId, name) => (
      name === "General" ||
      name === "Landmarks" ||
      Array.from(noteCategories.values()).some((category) => category.mapId === mapId && category.name === name)
    ),
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    recordAudit: async (input) => {
      auditEvents.push(input);
    }
  };
}

describe("marker service", () => {
  let deps: MarkerServiceDependencies & { auditEvents: unknown[] };

  beforeEach(() => {
    deps = createDependencies();
  });

  it("rejects notes whose category does not exist on the map", async () => {
    const note = {
      category: "Nonexistent",
      text: "",
      title: "Mine entrance",
      type: "note",
      x: 25,
      y: 30
    };

    const created = await createMarker({ actor: writer, input: note, mapId: "map-1" }, deps);
    expect(created).toEqual({ ok: false, error: "Note category does not exist on this map" });

    const valid = await createMarker({
      actor: writer,
      input: { ...note, category: "General" },
      mapId: "map-1"
    }, deps);
    expect(valid.ok).toBe(true);

    if (!valid.ok) {
      return;
    }

    const updated = await updateMarker({
      actor: writer,
      input: note,
      markerId: valid.value.id,
      markerType: "note"
    }, deps);
    expect(updated).toEqual({ ok: false, error: "Note category does not exist on this map" });
  });

  it("allows editing a note whose unchanged category no longer exists", async () => {
    const note = {
      category: "General",
      text: "",
      title: "Mine entrance",
      type: "note",
      x: 25,
      y: 30
    };
    const created = await createMarker({ actor: writer, input: note, mapId: "map-1" }, deps);
    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    // The note's category has since vanished from the map.
    deps.noteCategoryExists = async () => false;

    const updated = await updateMarker({
      actor: writer,
      input: { ...note, title: "Renamed entrance" },
      markerId: created.value.id,
      markerType: "note"
    }, deps);
    expect(updated).toMatchObject({ ok: true, value: { category: "General", title: "Renamed entrance" } });

    const recategorized = await updateMarker({
      actor: writer,
      input: { ...note, category: "Landmarks" },
      markerId: created.value.id,
      markerType: "note"
    }, deps);
    expect(recategorized).toEqual({ ok: false, error: "Note category does not exist on this map" });
  });

  it("records a MARKER_READ authorization failure when listing is denied", async () => {
    const result = await listMarkers({ actor: reader, mapId: "map-2" }, deps);

    expect(result).toEqual({ ok: false, error: "Read access is required" });
    expect(deps.auditEvents).toEqual([
      expect.objectContaining({
        action: "FAILED_AUTHORIZATION",
        metadata: { attemptedAction: "MARKER_READ" }
      })
    ]);
  });

  it("treats a path deleted under a different path type as not found", async () => {
    const created = await createMarker({
      actor: writer,
      input: {
        name: "Bridge",
        notes: "",
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
        type: "bridge",
        width: 1
      },
      mapId: "map-1"
    }, deps);

    expect(created.ok).toBe(true);

    if (!created.ok) {
      return;
    }

    const deleted = await deleteMarker({
      actor: writer,
      markerId: created.value.id,
      markerType: "canal"
    }, deps);

    expect(deleted).toEqual({ ok: false, error: "Marker was not found" });
    expect(deps.auditEvents).toHaveLength(1);
  });

  it("writes one delete audit when a concurrent delete wins the race", async () => {
    await createMarker({
      actor: writer,
      input: {
        damage: "",
        makerName: "",
        makerNumber: "",
        ql: "",
        type: "tower",
        x: 25,
        y: 30
      },
      mapId: "map-1"
    }, deps);
    const towers = deps.markers.tower;
    const softDeleteTower = towers.softDelete;
    let softDeleteCalls = 0;
    // Both requests see the live marker, but only the first conditional write matches.
    towers.softDelete = async (id, input) => {
      softDeleteCalls += 1;
      return softDeleteCalls === 1 ? softDeleteTower(id, input) : null;
    };
    const snapshot = await towers.find("tower-1");
    towers.find = async () => snapshot;

    const results = await Promise.all([
      deleteMarker({ actor: writer, markerId: "tower-1", markerType: "tower" }, deps),
      deleteMarker({ actor: writer, markerId: "tower-1", markerType: "tower" }, deps)
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "Marker was not found" }]);
    expect(deps.auditEvents.filter((event) => (
      (event as { action: string }).action === "MARKER_DELETED"
    ))).toHaveLength(1);
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

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toEqual({
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
    });
    expect(deps.auditEvents).not.toContainEqual(expect.objectContaining({
      action: "MARKER_LIST_VIEW"
    }));
  });

  it("serves no canary markers by default and never touches the canary store", async () => {
    let canaryStoreCalls = 0;
    const listCanaryMarkers = deps.listCanaryMarkers;
    deps.listCanaryMarkers = async (input) => {
      canaryStoreCalls += 1;
      return listCanaryMarkers(input);
    };
    const createCanaryMarkers = deps.createCanaryMarkers;
    deps.createCanaryMarkers = async (input) => {
      canaryStoreCalls += 1;
      return createCanaryMarkers(input);
    };

    const byDefault = await listMarkers({ actor: reader, mapId: "map-1" }, deps);
    const explicitFalse = await listMarkers({ actor: reader, includeCanaries: false, mapId: "map-1" }, deps);

    expect(byDefault.ok).toBe(true);
    expect(explicitFalse.ok).toBe(true);

    if (!byDefault.ok || !explicitFalse.ok) {
      return;
    }

    expect(byDefault.value.markers).toEqual([]);
    expect(explicitFalse.value.markers).toEqual([]);
    expect(canaryStoreCalls).toBe(0);
  });

  it("merges canary markers into the served list when includeCanaries is true", async () => {
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

    const result = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const canaryRecords = await deps.listCanaryMarkers({ mapId: "map-1", userId: reader.id });
    const canaryPayloads = canaryRecords.map((record) => record.payload);

    expect(canaryRecords).toHaveLength(CANARY_MARKERS_PER_MAP);
    expect(result.value.markers).toHaveLength(1 + CANARY_MARKERS_PER_MAP);
    expect(result.value.markers).toContainEqual(expect.objectContaining({ id: "tower-1" }));

    for (const payload of canaryPayloads) {
      expect(result.value.markers).toContainEqual(payload);
    }
  });

  it("interleaves canary markers deterministically across calls", async () => {
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

    const first = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);
    const second = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.markers).toEqual(second.value.markers);

    const canaryRecords = await deps.listCanaryMarkers({ mapId: "map-1", userId: reader.id });
    const expectedIds = ["tower-1", ...canaryRecords.map((record) => (
      (record.payload as { id: string }).id
    ))];

    expect(first.value.markers.map((marker) => marker.id).sort()).toEqual(expectedIds.sort());
  });

  it("reuses the viewer's canary markers across list calls", async () => {
    const first = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);
    const second = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.markers).toHaveLength(CANARY_MARKERS_PER_MAP);
    expect(second.value.markers).toEqual(first.value.markers);

    const canaryRecords = await deps.listCanaryMarkers({ mapId: "map-1", userId: reader.id });
    expect(canaryRecords).toHaveLength(CANARY_MARKERS_PER_MAP);
  });

  it("serves different canary markers to different viewers", async () => {
    const readerResult = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-1" }, deps);
    const writerResult = await listMarkers({ actor: writer, includeCanaries: true, mapId: "map-1" }, deps);

    expect(readerResult.ok).toBe(true);
    expect(writerResult.ok).toBe(true);

    if (!readerResult.ok || !writerResult.ok) {
      return;
    }

    const readerMarkerIds = readerResult.value.markers.map((marker) => marker.id);
    const writerMarkerIds = writerResult.value.markers.map((marker) => marker.id);

    expect(writerMarkerIds.some((id) => readerMarkerIds.includes(id))).toBe(false);
  });

  it("does not create canary markers when read access is denied", async () => {
    const result = await listMarkers({ actor: reader, includeCanaries: true, mapId: "map-2" }, deps);

    expect(result).toEqual({ ok: false, error: "Read access is required" });

    const canaryRecords = await deps.listCanaryMarkers({ mapId: "map-2", userId: reader.id });
    expect(canaryRecords).toHaveLength(0);
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

describe("marker service discord notifications", () => {
  let deps: MarkerServiceDependencies & { auditEvents: unknown[] };

  beforeEach(() => {
    mocks.dispatchDiscordNotification.mockReset();
    mocks.dispatchDiscordNotification.mockResolvedValue({ ok: true, value: null });
    deps = createDependencies();
  });

  it("dispatches a marker created notification after a successful create", async () => {
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

    expect(result.ok).toBe(true);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledWith(
      {
        kind: "marker",
        action: "created",
        username: "Writer",
        mapName: "Celebration",
        markerType: "tower"
      },
      expect.anything()
    );
  });

  it("dispatches a marker updated notification after a successful update", async () => {
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
    mocks.dispatchDiscordNotification.mockClear();

    const result = await updateMarker({
      actor: writer,
      input: {
        damage: "1.00",
        makerName: "Mako",
        makerNumber: "945",
        ql: "90.00",
        type: "tower",
        x: 25,
        y: 30
      },
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledWith(
      {
        kind: "marker",
        action: "updated",
        username: "Writer",
        mapName: "Celebration",
        markerType: "tower"
      },
      expect.anything()
    );
  });

  it("dispatches a marker deleted notification after a successful delete", async () => {
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
    mocks.dispatchDiscordNotification.mockClear();

    const result = await deleteMarker({
      actor: writer,
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledWith(
      {
        kind: "marker",
        action: "deleted",
        username: "Writer",
        mapName: "Celebration",
        markerType: "tower"
      },
      expect.anything()
    );
  });

  it("does not dispatch when the mutation fails", async () => {
    const denied = await createMarker({
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

    expect(denied.ok).toBe(false);

    const missing = await deleteMarker({
      actor: writer,
      markerId: "tower-404",
      markerType: "tower"
    }, deps);

    expect(missing.ok).toBe(false);
    expect(mocks.dispatchDiscordNotification).not.toHaveBeenCalled();
  });

  it("does not let a discord dispatch failure break the mutation", async () => {
    mocks.dispatchDiscordNotification.mockImplementation(() => {
      throw new Error("discord pipeline exploded");
    });

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

    expect(result.ok).toBe(true);
  });
});

describe("marker service alert detection triggers", () => {
  let deps: MarkerServiceDependencies & { auditEvents: unknown[] };

  beforeEach(() => {
    mocks.triggerAlertDetection.mockReset();
    deps = createDependencies();
  });

  it("triggers alert detection after a marker deletion", async () => {
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
    mocks.triggerAlertDetection.mockClear();

    const result = await deleteMarker({
      actor: writer,
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a failed marker write authorization", async () => {
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
    mocks.triggerAlertDetection.mockClear();

    const result = await deleteMarker({
      actor: reader,
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(result).toEqual({ ok: false, error: "Write access is required" });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after disbanding a deed", async () => {
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

    if (!created.ok) {
      return;
    }

    mocks.triggerAlertDetection.mockClear();

    const result = await disbandDeedMarker({
      actor: writer,
      markerId: created.value.id
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not trigger alert detection for marker creates or updates", async () => {
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

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).not.toHaveBeenCalled();
  });

  it("does not let a synchronous trigger failure break the mutation", async () => {
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
    mocks.triggerAlertDetection.mockImplementation(() => {
      throw new Error("alert pipeline exploded");
    });

    const result = await deleteMarker({
      actor: writer,
      markerId: "tower-1",
      markerType: "tower"
    }, deps);

    expect(result.ok).toBe(true);
  });
});
