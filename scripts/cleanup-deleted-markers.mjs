import { PrismaClient } from "@prisma/client";

const BATCH_LIMIT = 100;
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const towerCount = await cleanupTowers(now);
  const deedCount = await cleanupDeeds(now);
  const noteCount = await cleanupNotes(now);

  console.log(JSON.stringify({
    deletedCounts: {
      deed: deedCount,
      note: noteCount,
      tower: towerCount
    }
  }));
}

async function cleanupTowers(now) {
  const markers = await prisma.tower.findMany({
    orderBy: { deleteExpiresAt: "asc" },
    select: {
      id: true,
      mapId: true
    },
    take: BATCH_LIMIT,
    where: {
      deletedAt: { not: null },
      deleteExpiresAt: { lte: now }
    }
  });

  return cleanupMarkers({
    deleteOperation: prisma.tower.deleteMany.bind(prisma.tower),
    markerType: "tower",
    now,
    records: markers,
    targetType: "TOWER"
  });
}

async function cleanupDeeds(now) {
  const markers = await prisma.deed.findMany({
    orderBy: { deleteExpiresAt: "asc" },
    select: {
      id: true,
      mapId: true
    },
    take: BATCH_LIMIT,
    where: {
      deletedAt: { not: null },
      deleteExpiresAt: { lte: now }
    }
  });

  return cleanupMarkers({
    deleteOperation: prisma.deed.deleteMany.bind(prisma.deed),
    markerType: "deed",
    now,
    records: markers,
    targetType: "DEED"
  });
}

async function cleanupNotes(now) {
  const markers = await prisma.note.findMany({
    orderBy: { deleteExpiresAt: "asc" },
    select: {
      id: true,
      mapId: true
    },
    take: BATCH_LIMIT,
    where: {
      deletedAt: { not: null },
      deleteExpiresAt: { lte: now }
    }
  });

  return cleanupMarkers({
    deleteOperation: prisma.note.deleteMany.bind(prisma.note),
    markerType: "note",
    now,
    records: markers,
    targetType: "NOTE"
  });
}

async function cleanupMarkers({
  deleteOperation,
  markerType,
  now,
  records,
  targetType
}) {
  if (records.length === 0) {
    return 0;
  }

  const ids = records.map((record) => record.id);
  const auditEvents = records.map((record) => ({
    action: "MARKER_CLEANED_UP",
    actorUserId: null,
    mapId: record.mapId,
    metadata: {
      cleanedAt: now.toISOString(),
      markerType
    },
    targetId: record.id,
    targetType
  }));
  const [deleted] = await prisma.$transaction([
    deleteOperation({
      where: {
        id: { in: ids }
      }
    }),
    prisma.auditEvent.createMany({
      data: auditEvents
    })
  ]);

  return deleted.count;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
