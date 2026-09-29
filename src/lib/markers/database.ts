import type { Prisma } from "@prisma/client";
import { createCanaryDependencies } from "@/lib/canaries/database";
import { createAuditRecorder } from "@/lib/db/audit-recorder";
import { prisma } from "@/lib/db/prisma";
import { conditionalWrite } from "./conditional-write";
import { normalizeNoteCategoryMarkerShape, type MarkerServiceDependencies } from "./marker-service";

const mapWithLayers = {
  layers: {
    orderBy: [
      { sortOrder: "asc" as const },
      { name: "asc" as const }
    ]
  }
};

const markerUserRelations = {
  createdBy: { select: { username: true } },
  updatedBy: { select: { username: true } }
};

// Live markers are not soft-deleted and sit on an active map.
const liveFindArgs = (id: string) => ({
  include: { map: true, ...markerUserRelations },
  where: { deletedAt: null, id, map: { isActive: true } }
});

const activeListArgs = (mapId: string) => ({
  include: markerUserRelations,
  orderBy: { createdAt: "asc" as const },
  where: { deletedAt: null, mapId }
});

const liveUpdateArgs = <T>(id: string, data: T) => ({ data, where: { deletedAt: null, id } });

const withUsers = (id: string) => ({ include: markerUserRelations, where: { id } });

export function createMarkerDependencies(clientIp?: string): MarkerServiceDependencies {
  return {
    ...createCanaryDependencies(),
    disbandDeed: async (input) => prisma.$transaction(async (transaction) => {
      const deed = await transaction.deed.findFirst({
        where: { ...liveFindArgs(input.deedId).where, mapId: input.note.mapId }
      });

      if (deed === null) {
        return null;
      }

      // Claim the deed first so a concurrent disband/delete cannot also succeed.
      const claimed = await transaction.deed.updateMany({
        data: {
          deletedAt: input.deletedAt,
          deletedByUserId: input.actorUserId,
          deleteExpiresAt: input.deleteExpiresAt
        },
        where: { deletedAt: null, id: deed.id }
      });

      if (claimed.count === 0) {
        return null;
      }

      const category = await transaction.noteCategory.upsert({
        create: {
          mapId: deed.mapId,
          name: input.categoryName
        },
        update: {},
        where: {
          mapId_name: {
            mapId: deed.mapId,
            name: input.categoryName
          }
        }
      });
      const note = await transaction.note.create({
        data: input.note,
        include: markerUserRelations
      });
      const deletedDeed = await transaction.deed.update({
        data: { disbandNoteId: note.id },
        where: { id: deed.id }
      });

      return { category, deletedDeed, note };
    }),
    findMap: findActiveMap,
    markers: {
      camp: {
        create: async (data) => prisma.camp.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.camp.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.camp.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.camp.updateMany(liveUpdateArgs(id, data)),
          () => prisma.camp.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.camp.updateMany(liveUpdateArgs(id, data)),
          () => prisma.camp.findUnique(withUsers(id))
        )
      },
      deed: {
        create: async (data) => prisma.deed.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.deed.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.deed.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.deed.updateMany(liveUpdateArgs(id, data)),
          () => prisma.deed.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.deed.updateMany(liveUpdateArgs(id, data)),
          () => prisma.deed.findUnique(withUsers(id))
        )
      },
      locateSoul: {
        create: async (data) => prisma.locateSoul.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.locateSoul.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.locateSoul.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.locateSoul.updateMany(liveUpdateArgs(id, data)),
          () => prisma.locateSoul.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.locateSoul.updateMany(liveUpdateArgs(id, data)),
          () => prisma.locateSoul.findUnique(withUsers(id))
        )
      },
      minedoor: {
        create: async (data) => prisma.minedoor.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.minedoor.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.minedoor.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.minedoor.updateMany(liveUpdateArgs(id, data)),
          () => prisma.minedoor.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.minedoor.updateMany(liveUpdateArgs(id, data)),
          () => prisma.minedoor.findUnique(withUsers(id))
        )
      },
      note: {
        create: async (data) => prisma.note.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.note.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.note.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.note.updateMany(liveUpdateArgs(id, data)),
          () => prisma.note.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.note.updateMany(liveUpdateArgs(id, data)),
          () => prisma.note.findUnique(withUsers(id))
        )
      },
      path: {
        create: async (data) => prisma.pathMarker.create({
          data: { ...data, points: data.points as Prisma.InputJsonValue },
          include: markerUserRelations
        }).then(normalizePathRecord),
        find: async (id) => prisma.pathMarker.findFirst(liveFindArgs(id)).then(normalizeOptionalPathRecord),
        listActive: async (mapId) => prisma.pathMarker.findMany(activeListArgs(mapId))
          .then((paths) => paths.map(normalizePathRecord)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.pathMarker.updateMany(liveUpdateArgs(id, data)),
          () => prisma.pathMarker.findUnique({ where: { id } }).then(normalizeOptionalPathRecord)
        ),
        update: async (id, data) => conditionalWrite(
          prisma.pathMarker.updateMany(liveUpdateArgs(id, { ...data, points: data.points as Prisma.InputJsonValue })),
          () => prisma.pathMarker.findUnique(withUsers(id)).then(normalizeOptionalPathRecord)
        )
      },
      rift: {
        create: async (data) => prisma.rift.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.rift.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.rift.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.rift.updateMany(liveUpdateArgs(id, data)),
          () => prisma.rift.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.rift.updateMany(liveUpdateArgs(id, data)),
          () => prisma.rift.findUnique(withUsers(id))
        )
      },
      tower: {
        create: async (data) => prisma.tower.create({ data, include: markerUserRelations }),
        find: async (id) => prisma.tower.findFirst(liveFindArgs(id)),
        listActive: async (mapId) => prisma.tower.findMany(activeListArgs(mapId)),
        softDelete: async (id, data) => conditionalWrite(
          prisma.tower.updateMany(liveUpdateArgs(id, data)),
          () => prisma.tower.findUnique({ where: { id } })
        ),
        update: async (id, data) => conditionalWrite(
          prisma.tower.updateMany(liveUpdateArgs(id, data)),
          () => prisma.tower.findUnique(withUsers(id))
        )
      }
    },
    noteCategoryExists: async (mapId, name) => (
      await prisma.noteCategory.findUnique({
        select: { id: true },
        where: { mapId_name: { mapId, name } }
      })
    ) !== null,
    now: () => new Date(),
    recordAudit: createAuditRecorder(clientIp)
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

function normalizeOptionalPathRecord<T extends { points: Prisma.JsonValue }>(path: T | null) {
  return path === null ? null : normalizePathRecord(path);
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

export async function findActiveMap(mapId: string) {
  return prisma.map.findFirst({
    include: mapWithLayers,
    where: { id: mapId, isActive: true }
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
  const categories = await prisma.noteCategory.findMany({
    orderBy: { name: "asc" },
    select: {
      color: true,
      id: true,
      markerShape: true,
      name: true,
      pipSize: true
    },
    where: { mapId }
  });

  return categories.map((category) => ({
    ...category,
    markerShape: normalizeNoteCategoryMarkerShape(category.markerShape)
  }));
}
