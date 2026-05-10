import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MarkerServiceDependencies } from "./marker-service";

export function createMarkerDependencies(): MarkerServiceDependencies {
  return {
    createDeed: async (input) => prisma.deed.create({ data: input }),
    createNote: async (input) => prisma.note.create({ data: input }),
    createTower: async (input) => prisma.tower.create({ data: input }),
    findDeed: async (id) => prisma.deed.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findMap: async (mapId) => prisma.map.findFirst({
      where: { id: mapId, isActive: true }
    }),
    findNote: async (id) => prisma.note.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    findTower: async (id) => prisma.tower.findFirst({
      include: { map: true },
      where: { deletedAt: null, id }
    }),
    listActiveMarkers: async (mapId) => {
      const [towers, deeds, notes] = await Promise.all([
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
        })
      ]);

      return { deeds, notes, towers };
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
    updateNote: async (id, input) => prisma.note.update({
      data: input,
      where: { id }
    }),
    updateTower: async (id, input) => prisma.tower.update({
      data: input,
      where: { id }
    })
  };
}

export async function findActiveMap() {
  return prisma.map.findFirst({
    orderBy: { createdAt: "asc" },
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
