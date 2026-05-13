export const LOCATE_SOUL_DISTANCE_BANDS = [
  { key: "0", label: "0 tiles", minTiles: 0, maxTiles: 0 },
  { key: "1-3", label: "1-3 tiles", minTiles: 1, maxTiles: 3 },
  { key: "4-5", label: "4-5 tiles", minTiles: 4, maxTiles: 5 },
  { key: "6-9", label: "6-9 tiles", minTiles: 6, maxTiles: 9 },
  { key: "10-19", label: "10-19 tiles", minTiles: 10, maxTiles: 19 },
  { key: "20-49", label: "20-49 tiles", minTiles: 20, maxTiles: 49 },
  { key: "50-199", label: "50-199 tiles", minTiles: 50, maxTiles: 199 },
  { key: "200-499", label: "200-499 tiles", minTiles: 200, maxTiles: 499 },
  { key: "500-999", label: "500-999 tiles", minTiles: 500, maxTiles: 999 },
  { key: "1000+", label: "1000+ tiles", minTiles: 1000, maxTiles: 1999 },
  { key: "2000+", label: "2000+ tiles", minTiles: 2000, maxTiles: null }
] as const;

export const LOCATE_SOUL_CASTER_FACINGS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
] as const;

export const LOCATE_SOUL_DIRECTIONS = [
  "ahead",
  "aheadRight",
  "right",
  "behindRight",
  "behind",
  "behindLeft",
  "left",
  "aheadLeft"
] as const;

export type LocateSoulDistanceBandKey = typeof LOCATE_SOUL_DISTANCE_BANDS[number]["key"];
export type LocateSoulCasterFacing = typeof LOCATE_SOUL_CASTER_FACINGS[number];
export type LocateSoulDirection = typeof LOCATE_SOUL_DIRECTIONS[number];

export type ParsedLocateSoulMessage = {
  direction: LocateSoulDirection;
  distanceBand: LocateSoulDistanceBandKey;
  targetName: string;
};

export type LocateSoulOverlayGeometry = {
  centerAngleDegrees: number;
  maxDistanceTiles: number;
  minDistanceTiles: number;
  spanDegrees: number;
};

const LOCATE_SOUL_SECTOR_SPAN_DEGREES = 45;

const CASTER_FACING_DEGREES: Record<LocateSoulCasterFacing, number> = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315
};

const DIRECTION_OFFSET_DEGREES: Record<LocateSoulDirection, number> = {
  ahead: 0,
  aheadRight: 45,
  right: 90,
  behindRight: 135,
  behind: 180,
  behindLeft: 225,
  left: 270,
  aheadLeft: 315
};

const LOCATE_SOUL_DISTANCE_PHRASES: Array<{
  distanceBand: LocateSoulDistanceBandKey;
  phrase: string;
}> = [
  { distanceBand: "0", phrase: "practically standing" },
  { distanceBand: "1-3", phrase: "stone's throw away" },
  { distanceBand: "4-5", phrase: "very close" },
  { distanceBand: "6-9", phrase: "pretty close by" },
  { distanceBand: "10-19", phrase: "fairly close by" },
  { distanceBand: "50-199", phrase: "quite some distance away" },
  { distanceBand: "20-49", phrase: "some distance away" },
  { distanceBand: "200-499", phrase: "rather a long distance away" },
  { distanceBand: "500-999", phrase: "pretty far away" },
  { distanceBand: "2000+", phrase: "very far away" },
  { distanceBand: "1000+", phrase: "far away" }
];

const LOCATE_SOUL_DIRECTION_PHRASES: Array<{
  direction: LocateSoulDirection;
  phrase: string;
}> = [
  { direction: "behindRight", phrase: "behind you to the right" },
  { direction: "behindLeft", phrase: "behind you to the left" },
  { direction: "aheadRight", phrase: "ahead of you to the right" },
  { direction: "aheadRight", phrase: "in front of you to the right" },
  { direction: "aheadLeft", phrase: "ahead of you to the left" },
  { direction: "aheadLeft", phrase: "in front of you to the left" },
  { direction: "behind", phrase: "behind you" },
  { direction: "right", phrase: "to the right" },
  { direction: "left", phrase: "to the left" },
  { direction: "ahead", phrase: "ahead of you" },
  { direction: "ahead", phrase: "in front of you" }
];

export function isLocateSoulCasterFacing(input: string): input is LocateSoulCasterFacing {
  return LOCATE_SOUL_CASTER_FACINGS.includes(input as LocateSoulCasterFacing);
}

export function isLocateSoulDirection(input: string): input is LocateSoulDirection {
  return LOCATE_SOUL_DIRECTIONS.includes(input as LocateSoulDirection);
}

export function isLocateSoulDistanceBandKey(input: string): input is LocateSoulDistanceBandKey {
  return getLocateSoulDistanceBand(input) !== null;
}

export function getLocateSoulDistanceBand(key: string) {
  return LOCATE_SOUL_DISTANCE_BANDS.find((band) => band.key === key) ?? null;
}

export function getLocateSoulOverlayGeometry(input: {
  casterFacing: LocateSoulCasterFacing;
  direction: LocateSoulDirection;
  distanceBand: LocateSoulDistanceBandKey;
  mapHeightPx: number;
  mapWidthPx: number;
}): LocateSoulOverlayGeometry {
  const band = getLocateSoulDistanceBand(input.distanceBand);

  if (band === null) {
    throw new Error("Locate soul distance band was unexpectedly invalid");
  }

  return {
    centerAngleDegrees: normalizeDegrees(
      CASTER_FACING_DEGREES[input.casterFacing] + DIRECTION_OFFSET_DEGREES[input.direction]
    ),
    maxDistanceTiles: band.maxTiles ?? Math.ceil(Math.hypot(input.mapWidthPx, input.mapHeightPx)),
    minDistanceTiles: band.minTiles,
    spanDegrees: LOCATE_SOUL_SECTOR_SPAN_DEGREES
  };
}

export function locateSoulOverlayIntersectsMap(input: {
  casterFacing: LocateSoulCasterFacing;
  direction: LocateSoulDirection;
  distanceBand: LocateSoulDistanceBandKey;
  mapHeightPx: number;
  mapWidthPx: number;
  x: number;
  y: number;
}): boolean {
  const geometry = getLocateSoulOverlayGeometry(input);
  const center = { x: input.x + 0.5, y: input.y + 0.5 };
  const startAngle = geometry.centerAngleDegrees - geometry.spanDegrees / 2;
  const sampleCount = Math.max(1, Math.ceil(geometry.spanDegrees * 2));

  for (let index = 0; index <= sampleCount; index += 1) {
    const angle = startAngle + (geometry.spanDegrees * index) / sampleCount;
    const interval = getRayRectangleDistanceInterval(center, angle, input.mapWidthPx, input.mapHeightPx);

    if (
      interval !== null &&
      interval.maxDistance >= geometry.minDistanceTiles &&
      interval.minDistance <= geometry.maxDistanceTiles
    ) {
      return true;
    }
  }

  return false;
}

export function formatLocateSoulCasterFacing(facing: LocateSoulCasterFacing): string {
  return toSentenceCase(splitCamelOrJoinedDirection(facing));
}

export function formatLocateSoulDirection(direction: LocateSoulDirection): string {
  return toSentenceCase(splitCamelOrJoinedDirection(direction));
}

export function formatLocateSoulDistanceBand(distanceBand: LocateSoulDistanceBandKey): string {
  return getLocateSoulDistanceBand(distanceBand)?.label ?? distanceBand;
}

export function parseLocateSoulMessage(input: string): ParsedLocateSoulMessage | null {
  const lines = input
    .split(/\r?\n/)
    .map((line) => removeEventTimestamp(line).trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (line === undefined) {
      continue;
    }

    const parsed = parseLocateSoulLine(line);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function splitCamelOrJoinedDirection(input: string): string {
  return input.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function toSentenceCase(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function parseLocateSoulLine(line: string): ParsedLocateSoulMessage | null {
  const normalizedLine = line.toLowerCase();
  const distanceBand = parseLocateSoulDistancePhrase(normalizedLine);

  if (distanceBand === null) {
    return null;
  }

  const targetName = parseLocateSoulTargetName(line, distanceBand);

  if (targetName === null) {
    return null;
  }

  const direction = distanceBand === "0" ? "ahead" : parseLocateSoulDirectionPhrase(normalizedLine);

  if (direction === null) {
    return null;
  }

  return {
    direction,
    distanceBand,
    targetName
  };
}

function parseLocateSoulDistancePhrase(normalizedLine: string): LocateSoulDistanceBandKey | null {
  return LOCATE_SOUL_DISTANCE_PHRASES.find(({ phrase }) => normalizedLine.includes(phrase))?.distanceBand ?? null;
}

function parseLocateSoulDirectionPhrase(normalizedLine: string): LocateSoulDirection | null {
  return LOCATE_SOUL_DIRECTION_PHRASES.find(({ phrase }) => normalizedLine.includes(phrase))?.direction ?? null;
}

function parseLocateSoulTargetName(line: string, distanceBand: LocateSoulDistanceBandKey): string | null {
  if (distanceBand === "0") {
    const standingMatch = /^You are practically standing on (?:the )?(.+?)!?$/iu.exec(line.trim());
    return standingMatch?.[1] === undefined ? null : normalizeLocateSoulTargetName(standingMatch[1]);
  }

  const corpseMatch = /^(?:The\s+)?corpse of\s+(.+?)\s+is\s+/iu.exec(line.trim());

  if (corpseMatch?.[1] !== undefined) {
    return normalizeLocateSoulTargetName(corpseMatch[1]);
  }

  const playerMatch = /^(?:The\s+)?(.+?)\s+is\s+/iu.exec(line.trim());
  return playerMatch?.[1] === undefined ? null : normalizeLocateSoulTargetName(playerMatch[1]);
}

function normalizeLocateSoulTargetName(input: string): string | null {
  const targetName = input.trim().replace(/[.!]+$/u, "").trim();
  return targetName.length === 0 ? null : targetName;
}

function removeEventTimestamp(line: string): string {
  return line.replace(/^\s*\[\d{2}:\d{2}:\d{2}\]\s*/u, "");
}

function getRayRectangleDistanceInterval(
  center: { x: number; y: number },
  angleDegrees: number,
  width: number,
  height: number
): { maxDistance: number; minDistance: number } | null {
  const radians = angleDegrees * (Math.PI / 180);
  const direction = {
    x: Math.sin(radians),
    y: -Math.cos(radians)
  };
  let minDistance = 0;
  let maxDistance = Number.POSITIVE_INFINITY;

  const xInterval = getAxisDistanceInterval(center.x, direction.x, 0, width);
  if (xInterval === null) {
    return null;
  }

  minDistance = Math.max(minDistance, xInterval.minDistance);
  maxDistance = Math.min(maxDistance, xInterval.maxDistance);

  const yInterval = getAxisDistanceInterval(center.y, direction.y, 0, height);
  if (yInterval === null) {
    return null;
  }

  minDistance = Math.max(minDistance, yInterval.minDistance);
  maxDistance = Math.min(maxDistance, yInterval.maxDistance);

  return maxDistance < minDistance
    ? null
    : { maxDistance, minDistance };
}

function getAxisDistanceInterval(
  origin: number,
  direction: number,
  minValue: number,
  maxValue: number
): { maxDistance: number; minDistance: number } | null {
  if (Math.abs(direction) < 0.000001) {
    return origin < minValue || origin > maxValue
      ? null
      : { maxDistance: Number.POSITIVE_INFINITY, minDistance: 0 };
  }

  const firstDistance = (minValue - origin) / direction;
  const secondDistance = (maxValue - origin) / direction;

  return {
    maxDistance: Math.max(firstDistance, secondDistance),
    minDistance: Math.max(0, Math.min(firstDistance, secondDistance))
  };
}
