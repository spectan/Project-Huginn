import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DeletedMarkerDependencies } from "./deleted-marker-service";

type DeletedRecordDates = {
  deletedAt: Date | null;
  deleteExpiresAt: Date | null;
};

export function createDeletedMarkerDependencies(): DeletedMarkerDependencies {
  return {
    findDeletedDeed: async (id) => {
      const deed = await prisma.deed.findFirst({
        select: {
          deletedAt: true,
          deleteExpiresAt: true,
          id: true,
          mapId: true
        },
        where: {
          deletedAt: { not: null },
          id
        }
      });

      return deed === null ? null : requireDeletedReference(deed);
    },
    findDeletedNote: async (id) => {
      const note = await prisma.note.findFirst({
        select: {
          deletedAt: true,
          deleteExpiresAt: true,
          id: true,
          mapId: true
        },
        where: {
          deletedAt: { not: null },
          id
        }
      });

      return note === null ? null : requireDeletedReference(note);
    },
    findDeletedTower: async (id) => {
      const tower = await prisma.tower.findFirst({
        select: {
          deletedAt: true,
          deleteExpiresAt: true,
          id: true,
          mapId: true
        },
        where: {
          deletedAt: { not: null },
          id
        }
      });

      return tower === null ? null : requireDeletedReference(tower);
    },
    listExpiredDeletedMarkers: async ({ limit, now }) => {
      const [towers, deeds, notes] = await Promise.all([
        prisma.tower.findMany({
          orderBy: { deleteExpiresAt: "asc" },
          select: {
            deleteExpiresAt: true,
            id: true,
            mapId: true
          },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { lte: now }
          }
        }),
        prisma.deed.findMany({
          orderBy: { deleteExpiresAt: "asc" },
          select: {
            deleteExpiresAt: true,
            id: true,
            mapId: true
          },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { lte: now }
          }
        }),
        prisma.note.findMany({
          orderBy: { deleteExpiresAt: "asc" },
          select: {
            deleteExpiresAt: true,
            id: true,
            mapId: true
          },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { lte: now }
          }
        })
      ]);

      return {
        deeds: deeds.map(requireExpiredReference),
        notes: notes.map(requireExpiredReference),
        towers: towers.map(requireExpiredReference)
      };
    },
    listRestorableDeletedMarkers: async ({ limit, now }) => {
      const [towers, deeds, notes] = await Promise.all([
        prisma.tower.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.deed.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.note.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        })
      ]);

      return {
        deeds: deeds.map((deed) => ({
          ...deed,
          deletedAt: requireDate(deed.deletedAt),
          deleteExpiresAt: requireDate(deed.deleteExpiresAt)
        })),
        notes: notes.map((note) => ({
          ...note,
          deletedAt: requireDate(note.deletedAt),
          deleteExpiresAt: requireDate(note.deleteExpiresAt)
        })),
        towers: towers.map((tower) => ({
          ...tower,
          deletedAt: requireDate(tower.deletedAt),
          deleteExpiresAt: requireDate(tower.deleteExpiresAt)
        }))
      };
    },
    now: () => new Date(),
    permanentlyDeleteDeeds: async (ids) => {
      const result = await prisma.deed.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteNotes: async (ids) => {
      const result = await prisma.note.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteTowers: async (ids) => {
      const result = await prisma.tower.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    recordAudit: async (input) => {
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          mapId: input.mapId,
          metadata: input.metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    },
    restoreDeed: async (id, input) => restoreDeletedRecord("deed", id, input.updatedByUserId),
    restoreNote: async (id, input) => restoreDeletedRecord("note", id, input.updatedByUserId),
    restoreTower: async (id, input) => restoreDeletedRecord("tower", id, input.updatedByUserId)
  };
}

function deletedMarkerIncludes() {
  return {
    deletedBy: {
      select: {
        username: true
      }
    },
    map: {
      select: {
        name: true
      }
    }
  } as const;
}

function requireDeletedReference<T extends DeletedRecordDates & { id: string; mapId: string }>(
  record: T
) {
  return {
    deletedAt: requireDate(record.deletedAt),
    deleteExpiresAt: requireDate(record.deleteExpiresAt),
    id: record.id,
    mapId: record.mapId
  };
}

function requireExpiredReference<T extends { deleteExpiresAt: Date | null; id: string; mapId: string }>(
  record: T
) {
  return {
    deleteExpiresAt: requireDate(record.deleteExpiresAt),
    id: record.id,
    mapId: record.mapId
  };
}

function requireDate(value: Date | null): Date {
  if (value === null) {
    throw new Error("Deleted marker date was unexpectedly null");
  }

  return value;
}

async function restoreDeletedRecord(
  model: "deed" | "note" | "tower",
  id: string,
  updatedByUserId: string
): Promise<{ id: string; mapId: string } | null> {
  try {
    if (model === "tower") {
      return await prisma.tower.update({
        data: {
          deletedAt: null,
          deletedByUserId: null,
          deleteExpiresAt: null,
          updatedByUserId
        },
        select: {
          id: true,
          mapId: true
        },
        where: { id }
      });
    }

    if (model === "deed") {
      return await prisma.deed.update({
        data: {
          deletedAt: null,
          deletedByUserId: null,
          deleteExpiresAt: null,
          updatedByUserId
        },
        select: {
          id: true,
          mapId: true
        },
        where: { id }
      });
    }

    return await prisma.note.update({
      data: {
        deletedAt: null,
        deletedByUserId: null,
        deleteExpiresAt: null,
        updatedByUserId
      },
      select: {
        id: true,
        mapId: true
      },
      where: { id }
    });
  } catch {
    return null;
  }
}
