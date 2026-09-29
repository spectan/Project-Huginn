import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getDeleteExpiresAt } from "@/lib/domain/deletion";
import { ABANDONED_DEED_CATEGORY_NAME } from "@/lib/domain/note-categories";
import type { DeletedMarkerDependencies } from "./deleted-marker-service";

type DeletedRecordDates = {
  deletedAt: Date | null;
  deleteExpiresAt: Date | null;
};

export function createDeletedMarkerDependencies(clientIp?: string): DeletedMarkerDependencies {
  return {
    findDeletedCamp: async (id) => {
      const camp = await prisma.camp.findFirst({
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

      return camp === null ? null : requireDeletedReference(camp);
    },
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
    findDeletedLocateSoul: async (id) => {
      const locateSoul = await prisma.locateSoul.findFirst({
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

      return locateSoul === null ? null : requireDeletedReference(locateSoul);
    },
    findDeletedMinedoor: async (id) => {
      const minedoor = await prisma.minedoor.findFirst({
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

      return minedoor === null ? null : requireDeletedReference(minedoor);
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
    findDeletedPath: async (id, pathType) => {
      const path = await prisma.pathMarker.findFirst({
        select: {
          deletedAt: true,
          deleteExpiresAt: true,
          id: true,
          mapId: true
        },
        where: {
          deletedAt: { not: null },
          id,
          pathType
        }
      });

      return path === null ? null : requireDeletedReference(path);
    },
    findDeletedRift: async (id) => {
      const rift = await prisma.rift.findFirst({
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

      return rift === null ? null : requireDeletedReference(rift);
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
    listRestorableDeletedMarkers: async ({ limit, now }) => {
      const [towers, deeds, notes, rifts, camps, minedoors, locateSouls, paths] = await Promise.all([
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
        }),
        prisma.rift.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.camp.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.minedoor.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.locateSoul.findMany({
          include: deletedMarkerIncludes(),
          orderBy: { deletedAt: "desc" },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { gt: now }
          }
        }),
        prisma.pathMarker.findMany({
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
        camps: camps.map((camp) => ({
          ...camp,
          deletedAt: requireDate(camp.deletedAt),
          deleteExpiresAt: requireDate(camp.deleteExpiresAt)
        })),
        deeds: deeds.map((deed) => ({
          ...deed,
          deletedAt: requireDate(deed.deletedAt),
          deleteExpiresAt: requireDate(deed.deleteExpiresAt)
        })),
        locateSouls: locateSouls.map((locateSoul) => ({
          ...locateSoul,
          deletedAt: requireDate(locateSoul.deletedAt),
          deleteExpiresAt: requireDate(locateSoul.deleteExpiresAt)
        })),
        minedoors: minedoors.map((minedoor) => ({
          ...minedoor,
          deletedAt: requireDate(minedoor.deletedAt),
          deleteExpiresAt: requireDate(minedoor.deleteExpiresAt)
        })),
        notes: notes.map((note) => ({
          ...note,
          deletedAt: requireDate(note.deletedAt),
          deleteExpiresAt: requireDate(note.deleteExpiresAt)
        })),
        paths: paths.map((path) => ({
          ...path,
          deletedAt: requireDate(path.deletedAt),
          deleteExpiresAt: requireDate(path.deleteExpiresAt),
          pathType: requirePathType(path.pathType)
        })),
        rifts: rifts.map((rift) => ({
          ...rift,
          deletedAt: requireDate(rift.deletedAt),
          deleteExpiresAt: requireDate(rift.deleteExpiresAt)
        })),
        towers: towers.map((tower) => ({
          ...tower,
          deletedAt: requireDate(tower.deletedAt),
          deleteExpiresAt: requireDate(tower.deleteExpiresAt)
        }))
      };
    },
    now: () => new Date(),
    recordAudit: async (input) => {
      const metadata = clientIp !== undefined && clientIp.length > 0
        ? { ...input.metadata, clientIp }
        : input.metadata;
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          mapId: input.mapId,
          metadata: metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    },
    restoreCamp: async (id, input) => restoreIfRestorable(
      prisma.camp.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.camp.findUnique({ select: restoredSelect, where: { id } })
    ),
    restoreDeed: async (id, input) => prisma.$transaction(async (transaction) => {
      const deed = await transaction.deed.findFirst({
        select: { disbandNoteId: true },
        where: restorableWhere(id, input.now)
      });

      if (deed === null) {
        return null;
      }

      const { count } = await transaction.deed.updateMany({
        data: { ...restoreData(input), disbandNoteId: null },
        where: restorableWhere(id, input.now)
      });

      if (count === 0) {
        return null;
      }

      const restored = await transaction.deed.findUniqueOrThrow({ select: restoredSelect, where: { id } });
      const retiredNote = deed.disbandNoteId === null
        ? null
        : await retireDisbandNote(transaction, deed.disbandNoteId, input);

      return { ...restored, retiredNote };
    }),
    restoreLocateSoul: async (id, input) => restoreIfRestorable(
      prisma.locateSoul.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.locateSoul.findUnique({ select: restoredSelect, where: { id } })
    ),
    restoreMinedoor: async (id, input) => restoreIfRestorable(
      prisma.minedoor.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.minedoor.findUnique({ select: restoredSelect, where: { id } })
    ),
    restoreNote: async (id, input) => restoreIfRestorable(
      prisma.note.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.note.findUnique({ select: restoredSelect, where: { id } })
    ),
    restorePath: async (id, input) => restoreIfRestorable(
      prisma.pathMarker.updateMany({
        data: restoreData(input),
        where: { ...restorableWhere(id, input.now), pathType: input.pathType }
      }),
      () => prisma.pathMarker.findUnique({ select: restoredSelect, where: { id } })
    ),
    restoreRift: async (id, input) => restoreIfRestorable(
      prisma.rift.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.rift.findUnique({ select: restoredSelect, where: { id } })
    ),
    restoreTower: async (id, input) => restoreIfRestorable(
      prisma.tower.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
      () => prisma.tower.findUnique({ select: restoredSelect, where: { id } })
    )
  };
}

const restoredSelect = {
  id: true,
  mapId: true,
  x: true,
  y: true
} as const;

function restorableWhere(id: string, now: Date) {
  return {
    deletedAt: { not: null },
    deleteExpiresAt: { gt: now },
    id
  };
}

function restoreData(input: { updatedByUserId: string }) {
  return {
    deletedAt: null,
    deletedByUserId: null,
    deleteExpiresAt: null,
    updatedByUserId: input.updatedByUserId
  };
}

// Conditional restore: only rows still deleted and inside the restore window
// are touched, so concurrent restores resolve to one winner.
async function restoreIfRestorable<T>(
  write: Promise<{ count: number }>,
  reread: () => Promise<T | null>
): Promise<T | null> {
  const { count } = await write;

  return count === 0 ? null : reread();
}

// Soft-deletes the "Abandoned Deed" note left by a disband, but only while it
// is still live and still in that category: a note users have since
// recategorized has become their own content and is kept.
async function retireDisbandNote(
  transaction: Prisma.TransactionClient,
  noteId: string,
  input: { now: Date; updatedByUserId: string }
): Promise<{ id: string; x: number; y: number } | null> {
  const { count } = await transaction.note.updateMany({
    data: {
      deletedAt: input.now,
      deletedByUserId: input.updatedByUserId,
      deleteExpiresAt: getDeleteExpiresAt(input.now)
    },
    where: { category: ABANDONED_DEED_CATEGORY_NAME, deletedAt: null, id: noteId }
  });

  if (count === 0) {
    return null;
  }

  return transaction.note.findUnique({
    select: { id: true, x: true, y: true },
    where: { id: noteId }
  });
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

function requireDate(value: Date | null): Date {
  if (value === null) {
    throw new Error("Deleted marker date was unexpectedly null");
  }

  return value;
}

function requirePathType(value: string): "bridge" | "canal" | "highway" | "tunnel" {
  if (value === "bridge" || value === "canal" || value === "highway" || value === "tunnel") {
    return value;
  }

  throw new Error("Path marker type was unexpectedly invalid");
}
