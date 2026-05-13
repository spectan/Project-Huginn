import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MarkerServiceDependencies } from "./marker-service";

const mapWithLayers = {
  layers: {
    orderBy: [
      { sortOrder: "asc" as const },
      { name: "asc" as const }
    ]
  }
};

export function createMarkerDependencies(): MarkerServiceDependencies {
  return {
    createCamp: async (input) => prisma.camp.create({ data: input }),
    createDeed: async (input) => prisma.deed.create({ data: input }),
    createLocateSoul: async (input) => prisma.locateSoul.create({ data: input }),
    createMinedoor: async (input) => prisma.minedoor.create({ data: input }),
    createNote: async (input) => prisma.note.create({ data: input }),
    createPath: async (input) => prisma.pathMarker.create({
      data: {
        ...input,
        points: input.points as Prisma.InputJsonValue
      }
    }).then(normalizePathRecord),
    createRift: async (input) => prisma.rift.create({ data: input }),
    createTower: async (input) => prisma.tower.create({ data: input }),
    disbandDeed: async (input) => prisma.$transaction(async (transaction) => {
      const deed = await transaction.deed.findFirst({
        where: { deletedAt: null, id: input.deedId }
      });

      if (deed === null || deed.mapId !== input.note.mapId) {
        return null;
      }

      const existingCategory = await transaction.noteCategory.findUnique({
        where: {
          mapId_name: {
            mapId: deed.mapId,
            name: input.categoryName
          }
        }
      });
      const category = existingCategory ?? await transaction.noteCategory.create({
        data: {
          mapId: deed.mapId,
          name: input.categoryName
        }
      });
      const note = await transaction.note.create({
        data: input.note
      });
      const deletedDeed = await transaction.deed.update({
        data: {
          deletedAt: input.deletedAt,
          deletedByUserId: input.actorUserId,
          deleteExpiresAt: input.deleteExpiresAt
        },
        where: { id: deed.id }
      });

      return { category, deletedDeed, note };
    }),
    findCamp: async (id) => prisma.camp.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findDeed: async (id) => prisma.deed.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findLocateSoul: async (id) => prisma.locateSoul.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findMap: async (mapId) => prisma.map.findFirst({
      include: mapWithLayers,
      where: { id: mapId, isActive: true }
    }),
    findMinedoor: async (id) => prisma.minedoor.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findNote: async (id) => prisma.note.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findPath: async (id) => prisma.pathMarker.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }).then((path) => path === null ? null : normalizePathRecord(path)),
    findRift: async (id) => prisma.rift.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findTower: async (id) => prisma.tower.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    listActiveMarkers: async (mapId) => {
      const [towers, deeds, notes, rifts, camps, minedoors, locateSouls, paths] = await Promise.all([
        prisma.tower.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.deed.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.note.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.rift.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.camp.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.minedoor.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.locateSoul.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.pathMarker.findMany({
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        })
      ]);

      return { camps, deeds, locateSouls, minedoors, notes, paths: paths.map(normalizePathRecord), rifts, towers };
    },
    now: () => new Date(),
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
    softDeleteCamp: async (id, input) => {
      const existing = await prisma.camp.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.camp.update({ data: input, where: { id } });
    },
    softDeleteDeed: async (id, input) => {
      const existing = await prisma.deed.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.deed.update({ data: input, where: { id } });
    },
    softDeleteNote: async (id, input) => {
      const existing = await prisma.note.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.note.update({ data: input, where: { id } });
    },
    softDeleteMinedoor: async (id, input) => {
      const existing = await prisma.minedoor.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.minedoor.update({ data: input, where: { id } });
    },
    softDeleteLocateSoul: async (id, input) => {
      const existing = await prisma.locateSoul.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.locateSoul.update({ data: input, where: { id } });
    },
    softDeletePath: async (id, input) => {
      const existing = await prisma.pathMarker.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.pathMarker.update({ data: input, where: { id } }).then(normalizePathRecord);
    },
    softDeleteRift: async (id, input) => {
      const existing = await prisma.rift.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.rift.update({ data: input, where: { id } });
    },
    softDeleteTower: async (id, input) => {
      const existing = await prisma.tower.findFirst({ where: { deletedAt: null, id } });

      if (existing === null) {
        return null;
      }

      return prisma.tower.update({ data: input, where: { id } });
    },
    updateDeed: async (id, input) => prisma.deed.update({
      data: input,
      where: { id }
    }),
    updateCamp: async (id, input) => prisma.camp.update({
      data: input,
      where: { id }
    }),
    updateMinedoor: async (id, input) => prisma.minedoor.update({
      data: input,
      where: { id }
    }),
    updateLocateSoul: async (id, input) => prisma.locateSoul.update({
      data: input,
      where: { id }
    }),
    updateNote: async (id, input) => prisma.note.update({
      data: input,
      where: { id }
    }),
    updatePath: async (id, input) => prisma.pathMarker.update({
      data: {
        ...input,
        points: input.points as Prisma.InputJsonValue
      },
      where: { id }
    }).then(normalizePathRecord),
    updateRift: async (id, input) => prisma.rift.update({
      data: input,
      where: { id }
    }),
    updateTower: async (id, input) => prisma.tower.update({
      data: input,
      where: { id }
    })
  };
}

function normalizePathRecord<T extends {
  points: Prisma.JsonValue;
}>(path: T): T & { points: Array<{ x: number; y: number }> } {
  return {
    ...path,
    points: parseStoredPathPoints(path.points)
  };
}

function parseStoredPathPoints(points: Prisma.JsonValue): Array<{ x: number; y: number }> {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point) => {
    if (typeof point !== "object" || point === null || Array.isArray(point)) {
      return { x: 0, y: 0 };
    }

    const record = point as Record<string, unknown>;
    const x = record.x;
    const y = record.y;

    return {
      x: typeof x === "number" ? x : 0,
      y: typeof y === "number" ? y : 0
    };
  });
}

export async function findActiveMap(mapId?: string) {
  return prisma.map.findFirst({
    include: mapWithLayers,
    orderBy: { createdAt: "asc" },
    where: {
      id: mapId,
      isActive: true
    }
  });
}

export async function listActiveMapSummaries() {
  return prisma.map.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true
    },
    where: { isActive: true }
  });
}

export async function listNoteCategories(mapId: string) {
  return prisma.noteCategory.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true
    },
    where: { mapId }
  });
}
