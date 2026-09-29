import { PrismaClient } from "@prisma/client";

const BATCH_LIMIT = 100;
// Arbitrary app-wide key for pg_try_advisory_lock so only one cleanup runs at a time.
const CLEANUP_LOCK_KEY = 4815162342;
// A session-level advisory lock belongs to one connection, so pin the client
// to a single connection: the lock, every purge and the unlock share it.
const prisma = new PrismaClient(singleConnectionOptions(process.env.DATABASE_URL));

function singleConnectionOptions(databaseUrl) {
  if (databaseUrl === undefined || databaseUrl === "") {
    return {};
  }

  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", "1");

  return { datasourceUrl: url.toString() };
}

// Every soft-deletable marker table. `markerType` matches what the app writes
// into audit metadata; paths use their stored pathType (bridge, canal, ...).
const MARKER_MODELS = [
  { countKey: "tower", markerType: "tower", model: "tower", targetType: "TOWER" },
  { countKey: "deed", markerType: "deed", model: "deed", targetType: "DEED" },
  { countKey: "note", markerType: "note", model: "note", targetType: "NOTE" },
  { countKey: "rift", markerType: "rift", model: "rift", targetType: "RIFT" },
  { countKey: "camp", markerType: "camp", model: "camp", targetType: "CAMP" },
  { countKey: "minedoor", markerType: "minedoor", model: "minedoor", targetType: "MINEDOOR" },
  { countKey: "locateSoul", markerType: "locateSoul", model: "locateSoul", targetType: "LOCATE_SOUL" },
  { countKey: "path", markerType: null, model: "pathMarker", targetType: "PATH" }
];

async function main() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${CLEANUP_LOCK_KEY}::bigint) AS locked`;

  if (!locked) {
    console.log("Another cleanup is already running; exiting.");
    return;
  }

  try {
    await runCleanup();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${CLEANUP_LOCK_KEY}::bigint)`;
  }
}

async function runCleanup() {
  const now = new Date();
  const deletedCounts = {};

  for (const config of MARKER_MODELS) {
    deletedCounts[config.countKey] = await cleanupMarkers(config, now);
  }

  deletedCounts.shareLink = await cleanupShareLinks(now);
  deletedCounts.session = await cleanupSessions(now);

  console.log(JSON.stringify({ deletedCounts }));
}

async function cleanupShareLinks(now) {
  const deleted = await prisma.shareLink.deleteMany({
    where: {
      expiresAt: { lte: now }
    }
  });

  return deleted.count;
}

async function cleanupSessions(now) {
  const deleted = await prisma.session.deleteMany({
    where: {
      expiresAt: { lte: now }
    }
  });

  return deleted.count;
}

function expiredWhere(now) {
  return {
    deletedAt: { not: null },
    deleteExpiresAt: { lte: now }
  };
}

// Purges expired soft-deleted markers of one type in batches, writing one
// MARKER_CLEANED_UP audit per purged row.
async function cleanupMarkers({ markerType, model, targetType }, now) {
  let total = 0;

  for (;;) {
    const records = await prisma[model].findMany({
      orderBy: { deleteExpiresAt: "asc" },
      select: {
        id: true,
        mapId: true,
        ...(markerType === null ? { pathType: true } : {})
      },
      take: BATCH_LIMIT,
      where: expiredWhere(now)
    });

    if (records.length === 0) {
      break;
    }

    total += await purgeBatch({ markerType, model, now, records, targetType });

    if (records.length < BATCH_LIMIT) {
      break;
    }
  }

  return total;
}

async function purgeBatch({ markerType, model, now, records, targetType }) {
  const ids = records.map((record) => record.id);

  return prisma.$transaction(async (transaction) => {
    // Re-check the expiry so a marker restored since the read is kept.
    const deleted = await transaction[model].deleteMany({
      where: {
        ...expiredWhere(now),
        id: { in: ids }
      }
    });

    if (deleted.count === 0) {
      return 0;
    }

    const remaining = deleted.count === ids.length
      ? new Set()
      : new Set((await transaction[model].findMany({
          select: { id: true },
          where: { id: { in: ids } }
        })).map((record) => record.id));
    const purged = records.filter((record) => !remaining.has(record.id));

    await transaction.auditEvent.createMany({
      data: purged.map((record) => ({
        action: "MARKER_CLEANED_UP",
        actorUserId: null,
        mapId: record.mapId,
        metadata: {
          cleanedAt: now.toISOString(),
          markerType: markerType ?? record.pathType
        },
        targetId: record.id,
        targetType
      }))
    });

    return deleted.count;
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
