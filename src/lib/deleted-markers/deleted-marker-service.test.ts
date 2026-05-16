import { describe, expect, it } from "vitest";
import {
  cleanupExpiredDeletedMarkers,
  listRestorableDeletedMarkers,
  restoreDeletedMarker,
  type DeletedMarkerDependencies
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

function createDependencies(auditEvents: unknown[] = []): DeletedMarkerDependencies {
  return {
    findDeletedCamp: async () => null,
    findDeletedDeed: async () => null,
    findDeletedLocateSoul: async () => null,
    findDeletedMinedoor: async () => null,
    findDeletedNote: async () => null,
    findDeletedPath: async () => null,
    findDeletedRift: async () => null,
    findDeletedTower: async () => null,
    listExpiredDeletedMarkers: async () => ({
      camps: [],
      deeds: [],
      locateSouls: [],
      minedoors: [],
      notes: [],
      paths: [],
      rifts: [],
      towers: []
    }),
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
    now: () => now,
    permanentlyDeleteCamps: async () => 0,
    permanentlyDeleteDeeds: async () => 0,
    permanentlyDeleteLocateSouls: async () => 0,
    permanentlyDeleteMinedoors: async () => 0,
    permanentlyDeleteNotes: async () => 0,
    permanentlyDeletePaths: async () => 0,
    permanentlyDeleteRifts: async () => 0,
    permanentlyDeleteTowers: async () => 0,
    recordAudit: async (event) => {
      auditEvents.push(event);
    },
    restoreCamp: async () => null,
    restoreDeed: async () => null,
    restoreLocateSoul: async () => null,
    restoreMinedoor: async () => null,
    restoreNote: async () => null,
    restorePath: async () => null,
    restoreRift: async () => null,
    restoreTower: async () => null
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
    const dependencies: DeletedMarkerDependencies = {
      ...createDependencies(auditEvents),
      findDeletedTower: async () => ({
        deletedAt: new Date("2026-05-10T10:00:00.000Z"),
        deleteExpiresAt: expiresLater,
        id: "tower-1",
        mapId: "map-1"
      }),
      recordAudit: async (event) => {
        auditEvents.push(event);
      },
      restoreTower: async (id, input) => ({
        id,
        mapId: "map-1",
        restoredByUserId: input.updatedByUserId
      })
    };

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
        metadata: { markerType: "tower" },
        targetId: "tower-1",
        targetType: "TOWER"
      }
    ]);
  });

  it("does not restore markers after the restore window expires", async () => {
    const dependencies: DeletedMarkerDependencies = {
      ...createDependencies(),
      findDeletedNote: async () => ({
        deletedAt: new Date("2026-05-10T10:00:00.000Z"),
        deleteExpiresAt: expiredAt,
        id: "note-1",
        mapId: "map-1"
      })
    };

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

  it("permanently deletes expired markers and audits cleanup without coordinates", async () => {
    const auditEvents: unknown[] = [];
    const deletedIds: string[] = [];
    const dependencies: DeletedMarkerDependencies = {
      ...createDependencies(auditEvents),
      listExpiredDeletedMarkers: async ({ limit }) => {
        expect(limit).toBe(100);
        return {
          camps: [],
          deeds: [],
          locateSouls: [],
          minedoors: [],
          notes: [
            {
              deleteExpiresAt: expiredAt,
              id: "note-1",
              mapId: "map-1"
            }
          ],
          paths: [],
          rifts: [],
          towers: [
            {
              deleteExpiresAt: expiredAt,
              id: "tower-1",
              mapId: "map-1"
            }
          ]
        };
      },
      permanentlyDeleteNotes: async (ids) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      permanentlyDeleteTowers: async (ids) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      recordAudit: async (event) => {
        auditEvents.push(event);
      }
    };

    const result = await cleanupExpiredDeletedMarkers(dependencies);

    expect(result).toEqual({
      deletedCounts: {
        annotation: 0,
        bridge: 0,
        camp: 0,
        canal: 0,
        deed: 0,
        highway: 0,
        locateSoul: 0,
        minedoor: 0,
        note: 1,
        rift: 0,
        tower: 1
      }
    });
    expect(deletedIds).toEqual(["tower-1", "note-1"]);
    expect(auditEvents).toEqual([
      {
        action: "MARKER_CLEANED_UP",
        actorUserId: null,
        mapId: "map-1",
        metadata: {
          cleanedAt: "2026-05-10T12:00:00.000Z",
          markerType: "tower"
        },
        targetId: "tower-1",
        targetType: "TOWER"
      },
      {
        action: "MARKER_CLEANED_UP",
        actorUserId: null,
        mapId: "map-1",
        metadata: {
          cleanedAt: "2026-05-10T12:00:00.000Z",
          markerType: "note"
        },
        targetId: "note-1",
        targetType: "NOTE"
      }
    ]);
  });
});
