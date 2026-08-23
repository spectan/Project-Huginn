import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

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
const ABANDONED_DEED_CATEGORY_NAME = "Abandoned Deed";
const DISBAND_PATTERN = /^The settlement of (.+?) has just been disbanded/i;

function extractDeedNameFromDisbandMessage(message) {
  const match = message.match(DISBAND_PATTERN);
  return match?.[1]?.trim() ?? null;
}

function formatDisbandDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function handleDisbandEvents(mapId, events) {
  const disbandEvents = events
    .map((event) => ({
      deedName: extractDeedNameFromDisbandMessage(event.message),
      timestamp: event.timestamp
    }))
    .filter((event) => event.deedName !== null);

  if (disbandEvents.length === 0) {
    return;
  }

  for (const { deedName, timestamp } of disbandEvents) {
    try {
      const deed = await prisma.deed.findFirst({
        where: { deletedAt: null, mapId, name: deedName }
      });

      if (deed === null) {
        console.log(`    ${deedName}: deed not found, skipping`);
        continue;
      }

      await prisma.noteCategory.upsert({
        create: { mapId, name: ABANDONED_DEED_CATEGORY_NAME },
        update: {},
        where: { mapId_name: { mapId, name: ABANDONED_DEED_CATEGORY_NAME } }
      });

      const deletedAt = new Date();
      const deleteExpiresAt = new Date(
        deletedAt.getTime() + 72 * 60 * 60 * 1000
      );

      await prisma.$transaction([
        prisma.note.create({
          data: {
            category: ABANDONED_DEED_CATEGORY_NAME,
            mapId,
            text: `Disbanded - ${formatDisbandDate(timestamp)}`,
            title: deed.name,
            x: deed.x,
            y: deed.y
          }
        }),
        prisma.deed.update({
          data: {
            deletedAt,
            deleteExpiresAt
          },
          where: { id: deed.id }
        })
      ]);

      console.log(`    ${deedName}: disbanded → note created, deed soft-deleted`);
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
        const response = await fetch(url, { cache: "no-store" });

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

        const existingSet = new Set(existingEvents.map((e) => `${e.timestamp}:${e.message}`));
        const newEvents = events.filter((e) => !existingSet.has(`${e.timestamp}:${e.message}`));

        if (newEvents.length > 0) {
          await prisma.event.createMany({
            data: newEvents.map((event) => ({
              mapId,
              message: event.message,
              timestamp: event.timestamp
            }))
          });
          await handleDisbandEvents(mapId, newEvents);
        }

        const allEvents = await prisma.event.findMany({
          orderBy: { timestamp: "desc" },
          select: { id: true },
          where: { mapId }
        });

        if (allEvents.length > MAX_EVENTS_PER_SERVER) {
          const toDelete = allEvents.slice(MAX_EVENTS_PER_SERVER);
          await prisma.event.deleteMany({
            where: { id: { in: toDelete.map((e) => e.id) } }
          });
        }

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

  await syncAllEvents();

  setInterval(syncAllEvents, SYNC_INTERVAL_MS);
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
