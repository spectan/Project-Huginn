import type { Prisma } from "@prisma/client";
import { createAuditRecorder } from "@/lib/db/audit-recorder";
import { prisma } from "@/lib/db/prisma";
import { getDeleteExpiresAt } from "@/lib/domain/deletion";
import { ABANDONED_DEED_CATEGORY_NAME } from "@/lib/domain/note-categories";
import type { PathType } from "@/lib/domain/markers";
import { conditionalWrite } from "@/lib/markers/conditional-write";
import { isPathMarkerType } from "@/lib/markers/marker-types";
import type { DeletedMarkerDependencies, DeletedMarkerStore } from "./deleted-marker-service";

const deletedReferenceSelect = { deletedAt: true, deleteExpiresAt: true, id: true, mapId: true } as const;

const deletedWhere = (id: string) => ({ deletedAt: { not: null }, id });

const restorableListArgs = (limit: number, now: Date) => ({
  include: {
    deletedBy: { select: { username: true } },
    map: { select: { name: true } }
  },
  orderBy: { deletedAt: "desc" as const },
  take: limit,
  where: { deletedAt: { not: null }, deleteExpiresAt: { gt: now } }
});

export function createDeletedMarkerDependencies(clientIp?: string): DeletedMarkerDependencies {
  const pathStore = (pathType: PathType): DeletedMarkerStore => ({
    find: async (id) => prisma.pathMarker.findFirst({
      select: deletedReferenceSelect,
      where: { ...deletedWhere(id), pathType }
    }).then(withRequiredDates),
    restore: async (id, input) => conditionalWrite(
      prisma.pathMarker.updateMany({
        data: restoreData(input),
        where: { ...restorableWhere(id, input.now), pathType }
      }),
      () => prisma.pathMarker.findUnique({ select: restoredSelect, where: { id } })
    )
  });

  return {
    listRestorableDeletedMarkers: async ({ limit, now }) => {
      const args = restorableListArgs(limit, now);
      const [towers, deeds, notes, rifts, camps, minedoors, locateSouls, paths] = await Promise.all([
        prisma.tower.findMany(args),
        prisma.deed.findMany(args),
        prisma.note.findMany(args),
        prisma.rift.findMany(args),
        prisma.camp.findMany(args),
        prisma.minedoor.findMany(args),
        prisma.locateSoul.findMany(args),
        prisma.pathMarker.findMany(args)
      ]);

      return {
        camps: camps.map(requireDates),
        deeds: deeds.map(requireDates),
        locateSouls: locateSouls.map(requireDates),
        minedoors: minedoors.map(requireDates),
        notes: notes.map(requireDates),
        paths: paths.map((path) => ({ ...requireDates(path), pathType: requirePathType(path.pathType) })),
        rifts: rifts.map(requireDates),
        towers: towers.map(requireDates)
      };
    },
    markers: {
      bridge: pathStore("bridge"),
      camp: {
        find: async (id) => prisma.camp.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.camp.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.camp.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      canal: pathStore("canal"),
      deed: {
        find: async (id) => prisma.deed.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => prisma.$transaction(async (transaction) => {
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
        })
      },
      highway: pathStore("highway"),
      locateSoul: {
        find: async (id) => prisma.locateSoul.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.locateSoul.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.locateSoul.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      minedoor: {
        find: async (id) => prisma.minedoor.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.minedoor.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.minedoor.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      note: {
        find: async (id) => prisma.note.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.note.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.note.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      rift: {
        find: async (id) => prisma.rift.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.rift.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.rift.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      tower: {
        find: async (id) => prisma.tower.findFirst({ select: deletedReferenceSelect, where: deletedWhere(id) })
          .then(withRequiredDates),
        restore: async (id, input) => conditionalWrite(
          prisma.tower.updateMany({ data: restoreData(input), where: restorableWhere(id, input.now) }),
          () => prisma.tower.findUnique({ select: restoredSelect, where: { id } })
        )
      },
      tunnel: pathStore("tunnel")
    },
    now: () => new Date(),
    recordAudit: createAuditRecorder(clientIp)
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

// Deleted rows always carry their deletion dates; a null one is a data error.
function requireDates<T extends { deletedAt: Date | null; deleteExpiresAt: Date | null }>(record: T) {
  return {
    ...record,
    deletedAt: requireDate(record.deletedAt),
    deleteExpiresAt: requireDate(record.deleteExpiresAt)
  };
}

function withRequiredDates<T extends { deletedAt: Date | null; deleteExpiresAt: Date | null }>(record: T | null) {
  return record === null ? null : requireDates(record);
}

function requireDate(value: Date | null): Date {
  if (value === null) {
    throw new Error("Deleted marker date was unexpectedly null");
  }

  return value;
}

function requirePathType(value: string): PathType {
  if (isPathMarkerType(value)) {
    return value;
  }

  throw new Error("Path marker type was unexpectedly invalid");
}
