import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DeletedMarkerDependencies } from "./deleted-marker-service";

type DeletedRecordDates = {
  deletedAt: Date | null;
  deleteExpiresAt: Date | null;
};

export function createDeletedMarkerDependencies(): DeletedMarkerDependencies {
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
    findDeletedPath: async (id) => {
      const path = await prisma.pathMarker.findFirst({
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
    listExpiredDeletedMarkers: async ({ limit, now }) => {
      const [towers, deeds, notes, rifts, camps, minedoors, locateSouls, paths] = await Promise.all([
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
        }),
        prisma.rift.findMany({
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
        prisma.camp.findMany({
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
        prisma.minedoor.findMany({
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
        prisma.locateSoul.findMany({
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
        prisma.pathMarker.findMany({
          orderBy: { deleteExpiresAt: "asc" },
          select: {
            deleteExpiresAt: true,
            id: true,
            mapId: true,
            pathType: true
          },
          take: limit,
          where: {
            deletedAt: { not: null },
            deleteExpiresAt: { lte: now }
          }
        })
      ]);

      return {
        camps: camps.map(requireExpiredReference),
        deeds: deeds.map(requireExpiredReference),
        locateSouls: locateSouls.map(requireExpiredReference),
        minedoors: minedoors.map(requireExpiredReference),
        notes: notes.map(requireExpiredReference),
        paths: paths.map((path) => ({
          ...requireExpiredReference(path),
          pathType: requirePathType(path.pathType)
        })),
        rifts: rifts.map(requireExpiredReference),
        towers: towers.map(requireExpiredReference)
      };
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
    permanentlyDeleteCamps: async (ids) => {
      const result = await prisma.camp.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteDeeds: async (ids) => {
      const result = await prisma.deed.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteLocateSouls: async (ids) => {
      const result = await prisma.locateSoul.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteMinedoors: async (ids) => {
      const result = await prisma.minedoor.deleteMany({
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
    permanentlyDeletePaths: async (ids) => {
      const result = await prisma.pathMarker.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      return result.count;
    },
    permanentlyDeleteRifts: async (ids) => {
      const result = await prisma.rift.deleteMany({
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
    restoreCamp: async (id, input) => restoreDeletedRecord("camp", id, input.updatedByUserId),
    restoreDeed: async (id, input) => restoreDeletedRecord("deed", id, input.updatedByUserId),
    restoreLocateSoul: async (id, input) => restoreDeletedRecord("locateSoul", id, input.updatedByUserId),
    restoreMinedoor: async (id, input) => restoreDeletedRecord("minedoor", id, input.updatedByUserId),
    restoreNote: async (id, input) => restoreDeletedRecord("note", id, input.updatedByUserId),
    restorePath: async (id, input) => restoreDeletedRecord("path", id, input.updatedByUserId),
    restoreRift: async (id, input) => restoreDeletedRecord("rift", id, input.updatedByUserId),
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

function requirePathType(value: string): "bridge" | "canal" | "highway" | "tunnel" {
  if (value === "bridge" || value === "canal" || value === "highway" || value === "tunnel") {
    return value;
  }

  throw new Error("Path marker type was unexpectedly invalid");
}

async function restoreDeletedRecord(
  model: "camp" | "deed" | "locateSoul" | "minedoor" | "note" | "path" | "rift" | "tower",
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

    if (model === "rift") {
      return await prisma.rift.update({
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

    if (model === "camp") {
      return await prisma.camp.update({
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

    if (model === "minedoor") {
      return await prisma.minedoor.update({
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

    if (model === "locateSoul") {
      return await prisma.locateSoul.update({
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

    if (model === "path") {
      return await prisma.pathMarker.update({
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
