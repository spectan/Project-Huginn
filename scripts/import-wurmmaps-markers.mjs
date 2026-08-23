import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WURMMAPS_MARKER_API = "https://wurmmaps.xyz/APIs/marker-delegate.php";

const EXCLUDED_SERVERS = new Set(["Celebration", "Independence"]);

const TARGET_SERVERS = [
  "Affliction",
  "Cadence",
  "Chaos",
  "Defiance",
  "Deliverance",
  "Desertion",
  "Elevation",
  "Exodus",
  "Harmony",
  "Melody",
  "Pristine",
  "Release",
  "Serenity",
  "Xanadu"
];

const DEED_SIZE = 5;
const DEED_PERIMETER = 5;

async function fetchMarkers(serverName) {
  const slug = serverName.toLowerCase();
  const url = new URL(WURMMAPS_MARKER_API);
  url.searchParams.set("map", slug);
  url.searchParams.set("type", "marker");
  url.searchParams.set("action", "read");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => null);

  if (!Array.isArray(body)) {
    throw new Error("unexpected response format");
  }

  return body;
}

function parseMarker(marker) {
  return {
    creatorId: marker.creatorid ? String(marker.creatorid).trim() : null,
    flags: String(marker.flags ?? ""),
    kingdom: String(marker.kingdom ?? "0"),
    lastEditorId: marker.lasteditorid ? String(marker.lasteditorid).trim() : null,
    name: String(marker.name ?? "").trim(),
    quality: String(marker.quality ?? "").trim(),
    type: String(marker.type ?? ""),
    x: Number.parseInt(marker.xpos, 10),
    y: Number.parseInt(marker.ypos, 10)
  };
}

function parseQlHundredths(quality) {
  const parsed = Number.parseFloat(quality);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

async function importServer(map) {
  console.log(`\n[${map.name}] Fetching markers...`);

  const rawMarkers = await fetchMarkers(map.name);
  const markers = rawMarkers.map(parseMarker).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));

  const towers = markers.filter((m) => m.type === "0");
  const activeDeeds = markers.filter((m) => m.type === "1" && m.kingdom !== "0");
  const disbandedDeeds = markers.filter((m) => m.type === "1" && m.kingdom === "0");

  console.log(`  ${markers.length} total markers`);
  console.log(`  ${towers.length} towers, ${activeDeeds.length} active deeds, ${disbandedDeeds.length} disbanded deeds (skipped)`);

  const existingTowers = await prisma.tower.findMany({
    select: { id: true, x: true, y: true },
    where: { deletedAt: null, mapId: map.id }
  });
  const existingTowersKey = new Set(existingTowers.map((t) => `${t.x},${t.y}`));

  let towersCreated = 0;
  let towersSkipped = 0;

  for (const tower of towers) {
    const key = `${tower.x},${tower.y}`;

    if (existingTowersKey.has(key)) {
      towersSkipped++;
      continue;
    }

    await prisma.tower.create({
      data: {
        damageHundredths: null,
        mapId: map.id,
        qlHundredths: parseQlHundredths(tower.quality),
        makerName: "",
        makerNumber: "",
        planned: false,
        towerType: "Freedom Isles",
        x: tower.x,
        y: tower.y
      }
    });

    existingTowersKey.add(key);
    towersCreated++;
  }

  const existingDeeds = await prisma.deed.findMany({
    select: { id: true, name: true, x: true, y: true },
    where: { deletedAt: null, mapId: map.id }
  });
  const existingDeedsKey = new Set(existingDeeds.map((d) => `${d.name}|${d.x},${d.y}`));

  let deedsCreated = 0;
  let deedsSkipped = 0;

  for (const deed of activeDeeds) {
    const key = `${deed.name}|${deed.x},${deed.y}`;

    if (existingDeedsKey.has(key)) {
      deedsSkipped++;
      continue;
    }

    await prisma.deed.create({
      data: {
        east: DEED_SIZE,
        founder: deed.quality || "",
        mapId: map.id,
        name: deed.name,
        north: DEED_SIZE,
        perimeter: DEED_PERIMETER,
        south: DEED_SIZE,
        west: DEED_SIZE,
        x: deed.x,
        y: deed.y
      }
    });

    existingDeedsKey.add(key);
    deedsCreated++;
  }

  console.log(`  Created ${towersCreated} towers, skipped ${towersSkipped}`);
  console.log(`  Created ${deedsCreated} deeds, skipped ${deedsSkipped}`);
}

async function main() {
  console.log("Starting WurmMaps marker import");
  console.log(`Target servers: ${TARGET_SERVERS.join(", ")}`);
  console.log(`Excluded servers: ${[...EXCLUDED_SERVERS].join(", ")}`);

  const maps = await prisma.map.findMany({
    select: { id: true, name: true },
    where: { isActive: true, name: { in: TARGET_SERVERS } }
  });

  const foundNames = new Set(maps.map((m) => m.name));
  const missing = TARGET_SERVERS.filter((name) => !foundNames.has(name));

  if (missing.length > 0) {
    console.warn(`  No active map found for: ${missing.join(", ")}`);
  }

  for (const map of maps) {
    if (EXCLUDED_SERVERS.has(map.name)) {
      console.log(`\n[${map.name}] Skipping excluded server`);
      continue;
    }

    try {
      await importServer(map);
    } catch (error) {
      console.error(`  [${map.name}] Failed:`, error instanceof Error ? error.message : String(error));
    }

    // Be polite to the WurmMaps API between servers.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }


  await prisma.$disconnect();
  console.log("\nImport complete");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
