import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn()
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

import {
  listRestorableDeletedMarkers,
  restoreDeletedMarker,
  type DeletedMarkerDependencies,
  type DeletedMarkerStore
} from "./deleted-marker-service";

const adminActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-id",
  isAdmin: true
} as const;

const writerActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false
} as const;

const now = new Date("2026-05-10T12:00:00.000Z");
const expiresLater = new Date("2026-05-10T13:00:00.000Z");
const expiredAt = new Date("2026-05-10T11:59:59.000Z");

const missing: DeletedMarkerStore = { find: async () => null, restore: async () => null };
const liveTowerStore: DeletedMarkerStore = {
  find: async () => ({
    deletedAt: new Date("2026-05-10T10:00:00.000Z"),
    deleteExpiresAt: expiresLater,
    id: "tower-1",
    mapId: "map-1"
  }),
  restore: async (id) => ({ id, mapId: "map-1", x: 100, y: 200 })
};

function createDependencies(
  auditEvents: unknown[] = [],
  stores: Partial<DeletedMarkerDependencies["markers"]> = {}
): DeletedMarkerDependencies {
  return {
    listRestorableDeletedMarkers: async () => ({
      camps: [],
      deeds: [],
      locateSouls: [],
      minedoors: [],
      notes: [],
      paths: [],
      rifts: [],
      towers: [
        {
          deletedAt: new Date("2026-05-10T10:00:00.000Z"),
          deletedBy: { username: "Writer" },
          deleteExpiresAt: expiresLater,
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          map: { name: "Wurm" },
          mapId: "map-1",
          x: 100,
          y: 200
        }
      ]
    }),
    markers: {
      bridge: missing,
      camp: missing,
      canal: missing,
      deed: missing,
      highway: missing,
      locateSoul: missing,
      minedoor: missing,
      note: missing,
      rift: missing,
      tower: missing,
      tunnel: missing,
      ...stores
    },
    now: () => now,
    recordAudit: async (event) => {
      auditEvents.push(event);
    }
  };
}

describe("deleted marker service", () => {
  it("lists restorable deleted markers for admins", async () => {
    const dependencies = createDependencies();

    const result = await listRestorableDeletedMarkers({
      actor: adminActor,
      limit: 500
    }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: [
        {
          deletedAt: "2026-05-10T10:00:00.000Z",
          deletedByUsername: "Writer",
          deleteExpiresAt: "2026-05-10T13:00:00.000Z",
          id: "tower-1",
          label: "Mako 945",
          mapName: "Wurm",
          type: "tower",
          x: 100,
          y: 200
        }
      ]
    });
  });

  it("rejects non-admin restore listing and records failed authorization", async () => {
    const auditEvents: unknown[] = [];
    const dependencies = createDependencies(auditEvents);

    const result = await listRestorableDeletedMarkers({
      actor: writerActor
    }, dependencies);

    expect(result).toEqual({
      ok: false,
      error: "Admin access is required"
    });
    expect(auditEvents).toEqual([
      {
        action: "FAILED_AUTHORIZATION",
        actorUserId: "writer-id",
        mapId: null,
        metadata: { attemptedAction: "DELETED_MARKER_LIST" },
        targetId: null,
        targetType: "SYSTEM"
      }
    ]);
  });

  it("restores a deleted marker before the restore window expires", async () => {
    const auditEvents: unknown[] = [];
    const restoreInputs: unknown[] = [];
    const dependencies = createDependencies(auditEvents, {
      tower: {
        ...liveTowerStore,
        restore: async (id, input) => {
          restoreInputs.push(input);
          return { id, mapId: "map-1", x: 100, y: 200 };
        }
      }
    });

    const result = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "tower-1",
      markerType: "tower"
    }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: {
        markerId: "tower-1",
        markerType: "tower"
      }
    });
    expect(auditEvents).toEqual([
      {
        action: "MARKER_RESTORED",
        actorUserId: "admin-id",
        mapId: "map-1",
        metadata: { markerType: "tower", x: 100, y: 200 },
        targetId: "tower-1",
        targetType: "TOWER"
      }
    ]);
    expect(restoreInputs).toEqual([{ now, updatedByUserId: "admin-id" }]);
  });

  it("returns not found when a concurrent restore already won", async () => {
    const auditEvents: unknown[] = [];
    const dependencies = createDependencies(auditEvents, {
      tower: { ...liveTowerStore, restore: async () => null }
    });

    const result = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "tower-1",
      markerType: "tower"
    }, dependencies);

    expect(result).toEqual({ ok: false, error: "Deleted marker was not found" });
    expect(auditEvents).toEqual([]);
  });

  it("looks up and restores paths by their requested path type", async () => {
    const lookups: unknown[] = [];
    const restores: unknown[] = [];
    const pathStore = (pathType: string): DeletedMarkerStore => ({
      find: async (id) => {
        lookups.push({ id, pathType });
        return pathType === "bridge"
          ? { deletedAt: now, deleteExpiresAt: expiresLater, id, mapId: "map-1" }
          : null;
      },
      restore: async (id) => {
        restores.push(pathType);
        return { id, mapId: "map-1", x: 1, y: 2 };
      }
    });
    const dependencies = createDependencies([], {
      bridge: pathStore("bridge"),
      canal: pathStore("canal"),
      highway: pathStore("highway"),
      tunnel: pathStore("tunnel")
    });

    const mismatched = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "path-1",
      markerType: "canal"
    }, dependencies);
    const matched = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "path-1",
      markerType: "bridge"
    }, dependencies);

    expect(mismatched).toEqual({ ok: false, error: "Deleted marker was not found" });
    expect(matched.ok).toBe(true);
    expect(lookups).toEqual([
      { id: "path-1", pathType: "canal" },
      { id: "path-1", pathType: "bridge" }
    ]);
    expect(restores).toEqual(["bridge"]);
  });

  it("audits the abandoned deed note retired when a disbanded deed is restored", async () => {
    const auditEvents: unknown[] = [];
    const dependencies = createDependencies(auditEvents, {
      deed: {
        find: async (id) => ({ deletedAt: now, deleteExpiresAt: expiresLater, id, mapId: "map-1" }),
        restore: async (id) => ({
          id,
          mapId: "map-1",
          retiredNote: { id: "note-9", x: 50, y: 60 },
          x: 50,
          y: 60
        })
      }
    });

    const result = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "deed-1",
      markerType: "deed"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(auditEvents).toEqual([
      expect.objectContaining({ action: "MARKER_RESTORED", targetId: "deed-1", targetType: "DEED" }),
      {
        action: "MARKER_DELETED",
        actorUserId: "admin-id",
        mapId: "map-1",
        metadata: { markerType: "note", reason: "deed_restored", x: 50, y: 60 },
        targetId: "note-9",
        targetType: "NOTE"
      }
    ]);
  });

  it("merges deleted markers across types newest first and caps the total", async () => {
    const base = {
      deletedBy: null,
      deleteExpiresAt: expiresLater,
      map: { name: "Wurm" },
      mapId: "map-1",
      x: 1,
      y: 2
    };
    const dependencies: DeletedMarkerDependencies = {
      ...createDependencies(),
      listRestorableDeletedMarkers: async () => ({
        camps: [],
        deeds: [
          { ...base, deletedAt: new Date("2026-05-10T11:00:00.000Z"), founder: "F", id: "deed-new", name: "Deed" },
          { ...base, deletedAt: new Date("2026-05-10T08:00:00.000Z"), founder: "F", id: "deed-old", name: "Deed" }
        ],
        locateSouls: [],
        minedoors: [],
        notes: [],
        paths: [],
        rifts: [],
        towers: [
          { ...base, deletedAt: new Date("2026-05-10T09:00:00.000Z"), id: "tower-mid", makerName: "", makerNumber: "" }
        ]
      })
    };

    const result = await listRestorableDeletedMarkers({ actor: adminActor, limit: 2 }, dependencies);

    expect(result.ok && result.value.map((marker) => marker.id)).toEqual(["deed-new", "tower-mid"]);
  });

  it("does not restore markers after the restore window expires", async () => {
    const dependencies = createDependencies([], {
      note: {
        ...missing,
        find: async () => ({
          deletedAt: new Date("2026-05-10T10:00:00.000Z"),
          deleteExpiresAt: expiredAt,
          id: "note-1",
          mapId: "map-1"
        })
      }
    });

    const result = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "note-1",
      markerType: "note"
    }, dependencies);

    expect(result).toEqual({
      ok: false,
      error: "Restore window has expired"
    });
  });
});

describe("deleted marker service alert detection triggers", () => {
  beforeEach(() => {
    mocks.triggerAlertDetection.mockReset();
  });

  it("triggers alert detection after a failed authorization", async () => {
    const result = await listRestorableDeletedMarkers({
      actor: writerActor
    }, createDependencies());

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not trigger alert detection for a successful restore", async () => {
    const dependencies = createDependencies([], { tower: liveTowerStore });

    const result = await restoreDeletedMarker({
      actor: adminActor,
      markerId: "tower-1",
      markerType: "tower"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).not.toHaveBeenCalled();
  });

  it("does not let a synchronous trigger failure break the request", async () => {
    mocks.triggerAlertDetection.mockImplementation(() => {
      throw new Error("alert pipeline exploded");
    });

    const result = await listRestorableDeletedMarkers({
      actor: writerActor
    }, createDependencies());

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
  });
});
