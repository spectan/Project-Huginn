export type MarkerSignals = {
  coordinates: Array<{ x: number; y: number }>;
  ids: string[];
};

export type CanaryIdentifyRow = {
  id: string;
  mapId: string;
  payload: unknown;
  slot: number;
  userId: string;
};

export type CanaryHit = {
  slot: number;
  type: string;
  x: number | null;
  y: number | null;
};

export type CanaryMatch = {
  hits: CanaryHit[];
  mapId: string;
  userId: string;
};

// Canary payloads use 25-char lowercase hex ids (see buildCanaryPayload in
// canary-service.ts); cuid-shaped ids cover hand-pasted dumps of real markers.
const CANARY_ID_PATTERN = /\b[0-9a-f]{25}\b/g;
const CUID_ID_PATTERN = /\bc[0-9a-z]{20,24}\b/g;
const KEYED_COORDINATE_PATTERN = /"x"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"y"\s*:\s*(-?\d+(?:\.\d+)?)/g;
const PLAIN_COORDINATE_PATTERN = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;

export function extractMarkerSignals(text: string): MarkerSignals {
  const ids = new Set<string>();
  const coordinates = new Map<string, { x: number; y: number }>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    collectFromText(text, ids, coordinates);
    return toSignals(ids, coordinates);
  }

  collectFromJson(parsed, ids, coordinates);
  return toSignals(ids, coordinates);
}

export function matchCanaries(signals: MarkerSignals, rows: CanaryIdentifyRow[]): CanaryMatch[] {
  const ids = new Set(signals.ids);
  const coordinates = new Set(signals.coordinates.map(coordinateKey));
  const groups = new Map<string, CanaryMatch>();

  for (const row of rows) {
    if (!isRecord(row.payload)) {
      continue;
    }

    const payloadId = typeof row.payload.id === "string" ? row.payload.id : null;
    const payloadX = typeof row.payload.x === "number" ? row.payload.x : null;
    const payloadY = typeof row.payload.y === "number" ? row.payload.y : null;

    const idHit = payloadId !== null && ids.has(payloadId);
    const coordinateHit =
      payloadX !== null && payloadY !== null && coordinates.has(`${payloadX},${payloadY}`);

    if (!idHit && !coordinateHit) {
      continue;
    }

    const key = `${row.userId}:${row.mapId}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { hits: [], mapId: row.mapId, userId: row.userId };
      groups.set(key, group);
    }

    group.hits.push({
      slot: row.slot,
      type: typeof row.payload.type === "string" ? row.payload.type : "unknown",
      x: payloadX,
      y: payloadY
    });
  }

  for (const group of groups.values()) {
    group.hits.sort((a, b) => a.slot - b.slot);
  }

  return [...groups.values()];
}

function collectFromJson(
  value: unknown,
  ids: Set<string>,
  coordinates: Map<string, { x: number; y: number }>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFromJson(item, ids, coordinates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value.x === "number" && typeof value.y === "number") {
    addCoordinate(coordinates, value.x, value.y);
  }
  if (typeof value.id === "string") {
    ids.add(value.id);
  }

  for (const key of Object.keys(value)) {
    collectFromJson(value[key], ids, coordinates);
  }
}

function collectFromText(
  text: string,
  ids: Set<string>,
  coordinates: Map<string, { x: number; y: number }>
): void {
  for (const match of text.matchAll(KEYED_COORDINATE_PATTERN)) {
    addCoordinate(coordinates, Number(match[1]), Number(match[2]));
  }
  for (const match of text.matchAll(PLAIN_COORDINATE_PATTERN)) {
    addCoordinate(coordinates, Number(match[1]), Number(match[2]));
  }
  for (const match of text.matchAll(CANARY_ID_PATTERN)) {
    ids.add(match[0]);
  }
  for (const match of text.matchAll(CUID_ID_PATTERN)) {
    ids.add(match[0]);
  }
}

function addCoordinate(
  coordinates: Map<string, { x: number; y: number }>,
  x: number,
  y: number
): void {
  coordinates.set(`${x},${y}`, { x, y });
}

function coordinateKey(coordinate: { x: number; y: number }): string {
  return `${coordinate.x},${coordinate.y}`;
}

function toSignals(
  ids: Set<string>,
  coordinates: Map<string, { x: number; y: number }>
): MarkerSignals {
  return { coordinates: [...coordinates.values()], ids: [...ids] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
