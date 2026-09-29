import type { Prisma } from "@prisma/client";
import { createCanaryDependencies } from "@/lib/canaries/database";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import {
  DEFAULT_TOWER_TYPE,
  TOWER_TYPES,
  type TowerType
} from "@/lib/domain/markers";
import type { MarkerServiceDependencies } from "./marker-service";

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

export function createMarkerDependencies(clientIp?: string): MarkerServiceDependencies {
  return {
    ...createCanaryDependencies(),
    createCamp: async (input) => prisma.camp.create({ data: input, include: markerUserRelations }),
    createDeed: async (input) => prisma.deed.create({ data: input, include: markerUserRelations }),
    createLocateSoul: async (input) => prisma.locateSoul.create({ data: input, include: markerUserRelations }),
    createMinedoor: async (input) => prisma.minedoor.create({ data: input, include: markerUserRelations }),
    createNote: async (input) => prisma.note.create({ data: input, include: markerUserRelations }),
    createPath: async (input) => prisma.pathMarker.create({
      data: {
        ...input,
        points: input.points as Prisma.InputJsonValue
      },
      include: markerUserRelations
    }).then(normalizePathRecord),
    createRift: async (input) => prisma.rift.create({ data: input, include: markerUserRelations }),
    createTower: async (input) => prisma.tower.create({ data: input, include: markerUserRelations }).then(normalizeTowerRecord),
    disbandDeed: async (input) => prisma.$transaction(async (transaction) => {
      const deed = await transaction.deed.findFirst({
        where: { ...liveMarkerWhere(input.deedId), mapId: input.note.mapId }
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
    findCamp: async (id) => prisma.camp.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findDeed: async (id) => prisma.deed.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findLocateSoul: async (id) => prisma.locateSoul.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findMap: async (mapId) => prisma.map.findFirst({
      include: mapWithLayers,
      where: { id: mapId, isActive: true }
    }),
    findMinedoor: async (id) => prisma.minedoor.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findNote: async (id) => prisma.note.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findPath: async (id) => prisma.pathMarker.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }).then((path) => path === null ? null : normalizePathRecord(path)),
    findRift: async (id) => prisma.rift.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }),
    findTower: async (id) => prisma.tower.findFirst({
      include: { map: true, ...markerUserRelations },
      where: liveMarkerWhere(id)
    }).then((tower) => tower === null ? null : normalizeTowerRecord(tower)),
    listActiveMarkers: async (mapId) => {
      const [towers, deeds, notes, rifts, camps, minedoors, locateSouls, paths] = await Promise.all([
        prisma.tower.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.deed.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.note.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.rift.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.camp.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.minedoor.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.locateSoul.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        }),
        prisma.pathMarker.findMany({
          include: markerUserRelations,
          orderBy: { createdAt: "asc" },
          where: { deletedAt: null, mapId }
        })
      ]);

      return {
        camps,
        deeds,
        locateSouls,
        minedoors,
        notes,
        paths: paths.map(normalizePathRecord),
        rifts,
        towers: towers.map(normalizeTowerRecord)
      };
    },
    noteCategoryExists: async (mapId, name) => (
      await prisma.noteCategory.findUnique({
        select: { id: true },
        where: { mapId_name: { mapId, name } }
      })
    ) !== null,
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
    softDeleteCamp: async (id, input) => writeIfLive(
      prisma.camp.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.camp.findUnique({ where: { id } })
    ),
    softDeleteDeed: async (id, input) => writeIfLive(
      prisma.deed.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.deed.findUnique({ where: { id } })
    ),
    softDeleteNote: async (id, input) => writeIfLive(
      prisma.note.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.note.findUnique({ where: { id } })
    ),
    softDeleteMinedoor: async (id, input) => writeIfLive(
      prisma.minedoor.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.minedoor.findUnique({ where: { id } })
    ),
    softDeleteLocateSoul: async (id, input) => writeIfLive(
      prisma.locateSoul.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.locateSoul.findUnique({ where: { id } })
    ),
    softDeletePath: async (id, input) => writeIfLive(
      prisma.pathMarker.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.pathMarker.findUnique({ where: { id } })
        .then((path) => path === null ? null : normalizePathRecord(path))
    ),
    softDeleteRift: async (id, input) => writeIfLive(
      prisma.rift.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.rift.findUnique({ where: { id } })
    ),
    softDeleteTower: async (id, input) => writeIfLive(
      prisma.tower.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.tower.findUnique({ where: { id } })
        .then((tower) => tower === null ? null : normalizeTowerRecord(tower))
    ),
    updateDeed: async (id, input) => writeIfLive(
      prisma.deed.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.deed.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updateCamp: async (id, input) => writeIfLive(
      prisma.camp.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.camp.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updateMinedoor: async (id, input) => writeIfLive(
      prisma.minedoor.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.minedoor.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updateLocateSoul: async (id, input) => writeIfLive(
      prisma.locateSoul.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.locateSoul.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updateNote: async (id, input) => writeIfLive(
      prisma.note.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.note.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updatePath: async (id, input) => writeIfLive(
      prisma.pathMarker.updateMany({
        data: {
          ...input,
          points: input.points as Prisma.InputJsonValue
        },
        where: { deletedAt: null, id }
      }),
      () => prisma.pathMarker.findUnique({ include: markerUserRelations, where: { id } })
        .then((path) => path === null ? null : normalizePathRecord(path))
    ),
    updateRift: async (id, input) => writeIfLive(
      prisma.rift.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.rift.findUnique({ include: markerUserRelations, where: { id } })
    ),
    updateTower: async (id, input) => writeIfLive(
      prisma.tower.updateMany({ data: input, where: { deletedAt: null, id } }),
      () => prisma.tower.findUnique({ include: markerUserRelations, where: { id } })
        .then((tower) => tower === null ? null : normalizeTowerRecord(tower))
    )
  };
}

// Live markers are not soft-deleted and sit on an active map.
function liveMarkerWhere(id: string) {
  return { deletedAt: null, id, map: { isActive: true } };
}

// Conditional write: only rows still live are touched, so a concurrent
// delete/update race resolves to exactly one winner. Returns null when the
// row was no longer live, otherwise re-reads it.
async function writeIfLive<T>(
  write: Promise<{ count: number }>,
  reread: () => Promise<T | null>
): Promise<T | null> {
  const { count } = await write;

  return count === 0 ? null : reread();
}

function normalizeTowerRecord<T extends { towerType: string }>(
  tower: T
): Omit<T, "towerType"> & { towerType: TowerType } {
  return {
    ...tower,
    towerType: normalizeStoredTowerType(tower.towerType)
  };
}

function normalizeStoredTowerType(value: string): TowerType {
  return TOWER_TYPES.find((towerType) => towerType === value) ?? DEFAULT_TOWER_TYPE;
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

function normalizeNoteCategoryMarkerShape(value: string): NoteCategoryMarkerShape {
  return NOTE_CATEGORY_MARKER_SHAPES.find((shape) => shape === value) ?? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE;
}
