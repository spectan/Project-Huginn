import { createHash, randomUUID } from "crypto";
import type { WorkspaceMarker } from "@/lib/markers/marker-types";

export const CANARY_MARKERS_PER_MAP = 3;

type Bounds = {
  heightPx: number;
  widthPx: number;
};

type SeededRandom = () => number;

export type CanaryRecord = {
  id: string;
  mapId: string;
  payload: unknown;
  slot: number;
  userId: string;
};

export function generateCanaryMarkers(
  input: { mapId: string; userId: string },
  bounds: Bounds
): Array<{ payload: WorkspaceMarker; slot: number }> {
  const markers: Array<{ payload: WorkspaceMarker; slot: number }> = [];

  for (let slot = 0; slot < CANARY_MARKERS_PER_MAP; slot += 1) {
    const seed = hashSeed(`${input.mapId}:${input.userId}:${slot}`);
    const random = createSeededRandom(seed);
    markers.push({
      payload: buildCanaryPayload(random, bounds),
      slot
    });
  }

  return markers;
}

function buildCanaryPayload(random: SeededRandom, bounds: Bounds): WorkspaceMarker {
  const x = randomCoordinate(random, bounds.widthPx);
  const y = randomCoordinate(random, bounds.heightPx);
  const variant = Math.floor(random() * 3);

  if (variant === 0) {
    return buildTowerCanary(random, x, y);
  }

  if (variant === 1) {
    return buildNoteCanary(random, x, y);
  }

  return buildCampCanary(random, x, y);
}

function buildTowerCanary(random: SeededRandom, x: number, y: number): WorkspaceMarker {
  return {
    damage: formatDecimal(randomHundredths(random, 0, 4000)),
    id: randomMarkerId(),
    lastModifiedBy: pick(USERNAMES, random),
    makerName: pick(VILLAGE_NAMES, random),
    makerNumber: `T-${Math.floor(random() * 900) + 100}`,
    planned: random() < 0.2,
    ql: formatDecimal(randomHundredths(random, 2000, 9900)),
    towerType: pick(TOWER_TYPES, random),
    type: "tower",
    x,
    y
  };
}

function buildNoteCanary(random: SeededRandom, x: number, y: number): WorkspaceMarker {
  return {
    category: "General",
    id: randomMarkerId(),
    lastModifiedBy: pick(USERNAMES, random),
    text: pick(NOTE_TEXTS, random),
    title: pick(NOTE_TITLES, random),
    type: "note",
    x,
    y
  };
}

function buildCampCanary(random: SeededRandom, x: number, y: number): WorkspaceMarker {
  return {
    campType: random() < 0.5 ? "Goblin" : "Rift",
    id: randomMarkerId(),
    lastModifiedBy: pick(USERNAMES, random),
    notes: pick(CAMP_NOTES, random),
    type: "camp",
    x,
    y
  };
}

function randomCoordinate(random: SeededRandom, maxPx: number): number {
  const margin = Math.max(1, Math.floor(maxPx * 0.02));
  return margin + Math.floor(random() * Math.max(1, maxPx - margin * 2));
}

function randomHundredths(random: SeededRandom, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function formatDecimal(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

function randomMarkerId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 25);
}

function pick<T>(values: readonly T[], random: SeededRandom): T {
  return values[Math.floor(random() * values.length)] ?? values[0]!;
}

function hashSeed(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createSeededRandom(seedHex: string): SeededRandom {
  let state = Number.parseInt(seedHex.slice(0, 8), 16) || 1;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VILLAGE_NAMES = [
  "Thornwick",
  "Ashford",
  "Bramblewood",
  "Coldmere",
  "Dunharrow",
  "Eaglesrest",
  "Fenwick",
  "Grimsby",
  "Halloway",
  "Ironhold",
  "Kestrel Downs",
  "Larkspur",
  "Mossgrave",
  "Norwick",
  "Oakhaven",
  "Pineford",
  "Quarrymont",
  "Ravenscar",
  "Stonebrook",
  "Thistlewood"
] as const;

const USERNAMES = [
  "Aldric",
  "Borin",
  "Cedric",
  "Dain",
  "Elric",
  "Falka",
  "Gorim",
  "Hilda",
  "Isolde",
  "Joren",
  "Kessa",
  "Lorena",
  "Marek",
  "Nadia",
  "Osric",
  "Petra",
  "Quillon",
  "Ragna",
  "Sten",
  "Tilda"
] as const;

const TOWER_TYPES = [
  "Freedom Isles",
  "Horde of the Summoned",
  "Jenn-Kellon",
  "Mol-Rehan"
] as const;

const NOTE_TITLES = [
  "Clay spot",
  "Troll raid",
  "Ship wreck",
  "Rare tree",
  "Unique spawn",
  "Old mine",
  "Casting spot",
  "PvP sighting",
  "Market stall",
  "Tunnel entrance"
] as const;

const NOTE_TEXTS = [
  "Checked and confirmed.",
  "Saw this while traveling.",
  "Needs verification.",
  "Marked from a friend's tip.",
  "Resource quality looks good.",
  "Dangerous area, be careful.",
  "Easy to reach by boat.",
  "Abandoned long ago.",
  "Good spot for a deed.",
  "Visited last week."
] as const;

const CAMP_NOTES = [
  "Goblin camp spotted nearby.",
  "Rift camp active in the area.",
  "Camp cleared once, may return.",
  "Saw smoke from this direction.",
  "Heard drums at night.",
  "Avoid unless prepared."
] as const;
