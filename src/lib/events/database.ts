import { prisma } from "@/lib/db/prisma";
import { MAX_EVENTS_PER_SERVER } from "./event-feed";

export async function upsertEvents(mapId: string, events: Array<{ message: string; timestamp: number }>) {
  if (events.length === 0) {
    return;
  }

  const existingEvents = await prisma.event.findMany({
    select: { message: true, timestamp: true },
    where: { mapId }
  });

  const existingSet = new Set(existingEvents.map((e) => `${e.timestamp}:${e.message}`));
  const newEvents = events.filter((e) => !existingSet.has(`${e.timestamp}:${e.message}`));

  if (newEvents.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.event.createMany({
      data: newEvents.map((event) => ({
        mapId,
        message: event.message,
        timestamp: event.timestamp
      })),
      skipDuplicates: false
    }),
    prisma.event.deleteMany({
      where: {
        mapId,
        id: {
          notIn: (
            await prisma.event.findMany({
              orderBy: { timestamp: "desc" },
              select: { id: true },
              take: MAX_EVENTS_PER_SERVER,
              where: { mapId }
            })
          ).map((e) => e.id)
        }
      }
    })
  ]);
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
