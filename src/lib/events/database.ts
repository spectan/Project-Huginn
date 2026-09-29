import { prisma } from "@/lib/db/prisma";

export async function findLatestUniqueSlain(
  mapId: string
): Promise<{ message: string; timestamp: number } | null> {
  return prisma.event.findFirst({
    orderBy: { timestamp: "desc" },
    select: {
      message: true,
      timestamp: true
    },
    where: {
      mapId,
      OR: [
        { message: { contains: "slain", mode: "insensitive" } },
        { message: { contains: "slayed", mode: "insensitive" } }
      ]
    }
  });
}

export async function listEventsForMap(mapId: string, limit = 30) {
  return prisma.event.findMany({
    orderBy: { timestamp: "desc" },
    select: {
      id: true,
      message: true,
      timestamp: true
    },
    take: limit,
    where: { mapId }
  });
}
