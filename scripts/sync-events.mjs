import { PrismaClient } from "@prisma/client";
import {
  extractDeedNameFromDisbandMessage,
  extractDeedRenameFromMessage
} from "./event-feed-messages.mjs";

const prisma = new PrismaClient();

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15 * 1000;

const OFFICIAL_EVENT_FEED_URLS = {
  Affliction: "http://affliction.wurmonline.com/battles/server_feed.xml",
  Cadence: "https://cadence.game.wurmonline.com/battles/server_feed.xml",
  Celebration: "https://celebration.wurmonline.com/battles/server_feed.xml",
  Chaos: "http://chaos.game.wurmonline.com/battles/server_feed.xml",
  Defiance: "https://defiance.game.wurmonline.com/battles/server_feed.xml",
  Deliverance: "http://deliverance.game.wurmonline.com/battles/server_feed.xml",
  Desertion: "http://desertion.wurmonline.com/battles/server_feed.xml",
  Elevation: "http://elevation.wurmonline.com/battles/server_feed.xml",
  Exodus: "http://exodus.game.wurmonline.com/battles/server_feed.xml",
  Harmony: "https://harmony.game.wurmonline.com/battles/server_feed.xml",
  Independence: "https://independence.game.wurmonline.com/battles/server_feed.xml",
  Melody: "https://melody.game.wurmonline.com/battles/server_feed.xml",
  Pristine: "http://pristine.game.wurmonline.com/battles/server_feed.xml",
  Release: "http://release.game.wurmonline.com/battles/server_feed.xml",
  Serenity: "http://serenity.wurmonline.com/battles/server_feed.xml",
  Xanadu: "http://xanadu.game.wurmonline.com/battles/server_feed.xml"
};

const MAX_EVENTS_PER_SERVER = 100;
// Keep in sync with ABANDONED_DEED_CATEGORY_NAME in src/lib/domain/note-categories.ts.
const ABANDONED_DEED_CATEGORY_NAME = "Abandoned Deed";
// Keep in sync with DELETED_MARKER_RETENTION_HOURS in src/lib/domain/constants.ts.
const DELETED_MARKER_RETENTION_HOURS = 72;

function formatDisbandDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function handleRenameEvents(mapId, events) {
  // Oldest first, so chained renames (A -> B -> C) in one batch resolve in order.
  const renameEvents = events
    .map((event) => ({
      rename: extractDeedRenameFromMessage(event.message),
      timestamp: event.timestamp
    }))
    .filter((event) => event.rename !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const { rename } of renameEvents) {
    const { newName, oldName } = rename;

    try {
      const deed = await prisma.deed.findFirst({
        where: { deletedAt: null, mapId, name: oldName }
      });

      if (deed === null) {
        console.log(`    ${oldName}: deed not found, skipping rename`);
        continue;
      }

      await prisma.deed.update({
        data: { name: newName },
        where: { id: deed.id }
      });

      console.log(`    ${oldName}: renamed → ${newName}`);
    } catch (error) {
      console.error(`    ${oldName}: error handling rename -`, error instanceof Error ? error.message : String(error));
    }
  }
}

function formatDisbandedDeedNoteText(deed, timestamp) {
  const foundingDate = deed.foundingDate === null ? "Unknown" : deed.foundingDate.toISOString().slice(0, 10);

  // Mirrors formatDisbandedDeedNoteText in src/lib/markers/marker-service.ts,
  // plus the disband date reported by the feed.
  return [
    `Former deed: ${deed.name}`,
    `Mayor: ${deed.founder}`,
    `Founding date: ${foundingDate}`,
    `Dimensions: N${deed.north} W${deed.west} E${deed.east} S${deed.south}`,
    `Perimeter: ${deed.perimeter} tiles`,
    `Coordinates: ${deed.x}, ${deed.y}`,
    `Disbanded: ${formatDisbandDate(timestamp)}`
  ].join("\n");
}

// Mirrors disbandDeed in src/lib/markers/database.ts: claim the deed with a
// conditional soft-delete, upsert the category, create the note, link it to the
// deed and write the same audit rows (with no actor, since the feed did it).
async function disbandDeed(mapId, deed, timestamp) {
  const deletedAt = new Date();
  const deleteExpiresAt = new Date(
    deletedAt.getTime() + DELETED_MARKER_RETENTION_HOURS * 60 * 60 * 1000
  );

  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.deed.updateMany({
      data: {
        deletedAt,
        deletedByUserId: null,
        deleteExpiresAt
      },
      where: { deletedAt: null, id: deed.id }
    });

    if (claimed.count === 0) {
      return false;
    }

    const category = await transaction.noteCategory.upsert({
      create: { mapId, name: ABANDONED_DEED_CATEGORY_NAME },
      update: {},
      where: { mapId_name: { mapId, name: ABANDONED_DEED_CATEGORY_NAME } }
    });
    const note = await transaction.note.create({
      data: {
        category: ABANDONED_DEED_CATEGORY_NAME,
        mapId,
        text: formatDisbandedDeedNoteText(deed, timestamp),
        title: deed.name,
        x: deed.x,
        y: deed.y
      }
    });

    await transaction.deed.update({
      data: { disbandNoteId: note.id },
      where: { id: deed.id }
    });
    await transaction.auditEvent.createMany({
      data: [
        {
          action: "MARKER_CREATED",
          actorUserId: null,
          mapId,
          metadata: { markerType: "note", source: "event-feed", x: note.x, y: note.y },
          targetId: note.id,
          targetType: "NOTE"
        },
        {
          action: "MARKER_DELETED",
          actorUserId: null,
          mapId,
          metadata: {
            convertedTo: "note",
            markerType: "deed",
            noteCategory: category.name,
            source: "event-feed",
            x: deed.x,
            y: deed.y
          },
          targetId: deed.id,
          targetType: "DEED"
        }
      ]
    });

    return true;
  });
}

async function handleDisbandEvents(mapId, events) {
  const disbandEvents = events
    .map((event) => ({
      deedName: extractDeedNameFromDisbandMessage(event.message),
      timestamp: event.timestamp
    }))
    .filter((event) => event.deedName !== null);

  for (const { deedName, timestamp } of disbandEvents) {
    try {
      const deed = await prisma.deed.findFirst({
        where: { deletedAt: null, map: { isActive: true }, mapId, name: deedName }
      });

      if (deed === null) {
        console.log(`    ${deedName}: deed not found, skipping`);
        continue;
      }

      const disbanded = await disbandDeed(mapId, deed, timestamp);

      console.log(disbanded
        ? `    ${deedName}: disbanded → note created, deed soft-deleted`
        : `    ${deedName}: deed already deleted, skipping`);
    } catch (error) {
      console.error(`    ${deedName}: error handling disband -`, error instanceof Error ? error.message : String(error));
    }
  }
}

function parseEventFeedXml(xml) {
  const events = [];
  const messageRegex = /<message\s+text="([^"]*)"\s+time="(\d+)"\s*\/>/g;
  let match;

  while ((match = messageRegex.exec(xml)) !== null) {
    const message = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const timestamp = Number.parseInt(match[2], 10);

    if (message !== "" && Number.isFinite(timestamp)) {
      events.push({ message, timestamp });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

// An event is new only if it is not stored yet and is no older than the newest
// stored event, so feed entries that were trimmed away are never replayed
// (which would re-run their rename/disband side effects).
function selectNewEvents(feedEvents, storedEvents) {
  if (storedEvents.length === 0) {
    return feedEvents;
  }

  const storedKeys = new Set(storedEvents.map((e) => `${e.timestamp}:${e.message}`));
  const newestStoredTimestamp = storedEvents.reduce(
    (newest, e) => Math.max(newest, e.timestamp),
    Number.NEGATIVE_INFINITY
  );

  return feedEvents.filter((e) => (
    e.timestamp >= newestStoredTimestamp && !storedKeys.has(`${e.timestamp}:${e.message}`)
  ));
}

async function trimEvents(mapId, keep) {
  await prisma.$transaction(async (transaction) => {
    const newest = await transaction.event.findMany({
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      select: { id: true },
      take: keep,
      where: { mapId }
    });

    await transaction.event.deleteMany({
      where: { id: { notIn: newest.map((event) => event.id) }, mapId }
    });
  });
}

async function syncAllEvents() {
  console.log(`[${new Date().toISOString()}] Starting event sync`);

  try {
    const maps = await prisma.map.findMany({
      select: { id: true, name: true },
      where: { isActive: true }
    });

    const mapByName = new Map(maps.map((m) => [m.name, m.id]));
    let synced = 0;
    let failed = 0;

    for (const [serverName, url] of Object.entries(OFFICIAL_EVENT_FEED_URLS)) {
      const mapId = mapByName.get(serverName);

      if (mapId === undefined) {
        continue;
      }

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });

        if (!response.ok) {
          console.log(`  ${serverName}: fetch failed (${response.status})`);
          failed++;
          continue;
        }

        const xml = await response.text();
        const events = parseEventFeedXml(xml);

        if (events.length === 0) {
          console.log(`  ${serverName}: no events`);
          synced++;
          continue;
        }

        const existingEvents = await prisma.event.findMany({
          select: { message: true, timestamp: true },
          where: { mapId }
        });
        const newEvents = selectNewEvents(events, existingEvents);

        if (newEvents.length > 0) {
          await prisma.event.createMany({
            data: newEvents.map((event) => ({
              mapId,
              message: event.message,
              timestamp: event.timestamp
            })),
            skipDuplicates: true
          });
          await handleRenameEvents(mapId, newEvents);
          await handleDisbandEvents(mapId, newEvents);
        }

        // Keep at least the whole feed stored so its older entries are never
        // trimmed and later mistaken for new ones.
        await trimEvents(mapId, Math.max(MAX_EVENTS_PER_SERVER, events.length));

        console.log(`  ${serverName}: ${events.length} events (${newEvents.length} new)`);
        synced++;
      } catch (error) {
        console.error(`  ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log(`[${new Date().toISOString()}] Sync complete. Success: ${synced}, Failed: ${failed}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Sync error:`, error instanceof Error ? error.message : String(error));
  }
}

async function run() {
  console.log("Event sync service starting...");

  // Reschedule only after a run finishes so slow runs never overlap.
  const loop = async () => {
    await syncAllEvents();
    setTimeout(loop, SYNC_INTERVAL_MS);
  };

  await loop();
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
