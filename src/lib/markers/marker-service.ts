import { triggerAlertsSafely } from "@/lib/alerts/trigger-safely";
import { getOrCreateCanaries, type CanaryDependencies } from "@/lib/canaries/canary-service";
import { dispatchDiscordSafely } from "@/lib/discord/dispatch-safely";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import type { MapBounds } from "@/lib/domain/coordinates";
import { getDeleteExpiresAt } from "@/lib/domain/deletion";
import {
  isLocateSoulCasterFacing,
  isLocateSoulDirection,
  isLocateSoulDistanceBandKey
} from "@/lib/domain/locate-soul";
import {
  DEFAULT_TOWER_TYPE,
  TOWER_TYPES,
  validateCampInput,
  validateDeedInput,
  validateLocateSoulInput,
  validateMinedoorInput,
  validateNoteInput,
  validatePathInput,
  validateRiftInput,
  validateTowerInput,
  type CampInput,
  type CampMarkerInput,
  type DeedInput,
  type DeedMarkerInput,
  type LocateSoulInput,
  type LocateSoulMarkerInput,
  type MinedoorMarkerInput,
  type NoteMarkerInput,
  type PathInput,
  type PathMarkerInput,
  type PathType,
  type RiftInput,
  type RiftMarkerInput,
  type TowerInput,
  type TowerMarkerInput,
  type TowerType
} from "@/lib/domain/markers";
import { formatHundredths } from "@/lib/domain/number-fields";
import {
  canReadMap,
  canWriteMarkers,
  type UserAccess
} from "@/lib/domain/permissions";
import {
  ABANDONED_DEED_CATEGORY_NAME,
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  MAX_NOTE_CATEGORY_PIP_SIZE,
  MIN_NOTE_CATEGORY_PIP_SIZE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import { err, ok, type Result } from "@/lib/domain/result";
import {
  MAP_NOT_FOUND,
  MARKER_NOT_FOUND,
  READ_ACCESS_REQUIRED,
  WRITE_ACCESS_REQUIRED
} from "./marker-errors";
import {
  MARKER_AUDIT_TARGETS,
  getMarkerKind,
  isPathMarkerType,
  isPersistedMarkerType,
  type CampWorkspaceMarker,
  type DeedWorkspaceMarker,
  type LocateSoulWorkspaceMarker,
  type MarkerAuditTarget,
  type MarkerKind,
  type MarkerType,
  type MinedoorWorkspaceMarker,
  type NoteCategory,
  type NoteWorkspaceMarker,
  type PathWorkspaceMarker,
  type PersistedMarkerType,
  type RiftWorkspaceMarker,
  type TowerWorkspaceMarker,
  type WorkspaceMap,
  type WorkspaceMarker
} from "./marker-types";

type Actor = UserAccess & {
  id: string;
  username: string;
};

type MapRecord = {
  heightPx: number;
  id: string;
  imagePath: string;
  layers?: MapLayerRecord[];
  name: string;
  widthPx: number;
};

type MapLayerRecord = {
  heightPx: number;
  id: string;
  imagePath: string;
  isDefault: boolean;
  name: string;
  widthPx: number;
};

type MarkerModifierRecord = {
  createdBy?: { username: string } | null;
  updatedBy?: { username: string } | null;
};

type MarkerRecord<T> = T & { id: string; mapId: string } & MarkerModifierRecord;
type TowerRecord = MarkerRecord<Omit<TowerMarkerInput, "towerType"> & { towerType: string }>;
type DeedRecord = MarkerRecord<DeedMarkerInput>;
type NoteRecord = MarkerRecord<NoteMarkerInput>;
type RiftRecord = MarkerRecord<RiftMarkerInput>;
type CampRecord = MarkerRecord<Omit<CampMarkerInput, "campType"> & { campType: string }>;
type MinedoorRecord = MarkerRecord<MinedoorMarkerInput>;
type LocateSoulRecord = MarkerRecord<Omit<LocateSoulMarkerInput, "casterFacing" | "direction" | "distanceBand"> & {
  casterFacing: string;
  direction: string;
  distanceBand: string;
}>;
type PathRecord = MarkerRecord<Omit<PathMarkerInput, "pathType"> & { pathType: string }>;

type NoteCategoryRecord = {
  color: string | null;
  id: string;
  markerShape: string;
  mapId: string;
  name: string;
  pipSize: number;
};

type MarkerWithMap<T> = T & {
  map: MapRecord;
};

// Per marker kind: raw parsed input, validated input, stored record and served marker.
type KindTypes<Input, Valid, StoredRecord, Marker extends WorkspaceMarker> = {
  input: Input;
  marker: Marker;
  record: StoredRecord;
  valid: Valid;
};

type MarkerKindTypes = {
  camp: KindTypes<CampInput, CampMarkerInput, CampRecord, CampWorkspaceMarker>;
  deed: KindTypes<DeedInput, DeedMarkerInput, DeedRecord, DeedWorkspaceMarker>;
  locateSoul: KindTypes<LocateSoulInput, LocateSoulMarkerInput, LocateSoulRecord, LocateSoulWorkspaceMarker>;
  minedoor: KindTypes<MinedoorMarkerInput, MinedoorMarkerInput, MinedoorRecord, MinedoorWorkspaceMarker>;
  note: KindTypes<NoteMarkerInput, NoteMarkerInput, NoteRecord, NoteWorkspaceMarker>;
  path: KindTypes<PathInput, PathMarkerInput, PathRecord, PathWorkspaceMarker>;
  rift: KindTypes<RiftInput, RiftMarkerInput, RiftRecord, RiftWorkspaceMarker>;
  tower: KindTypes<TowerInput, TowerMarkerInput, TowerRecord, TowerWorkspaceMarker>;
};

type KindInput<K extends MarkerKind> = MarkerKindTypes[K]["input"];
type KindValid<K extends MarkerKind> = MarkerKindTypes[K]["valid"];
type KindRecord<K extends MarkerKind> = MarkerKindTypes[K]["record"];
type KindMarker<K extends MarkerKind> = MarkerKindTypes[K]["marker"];
type PersistedWorkspaceMarker = KindMarker<MarkerKind>;

type MarkerAuditInput = {
  action: "FAILED_AUTHORIZATION" | "MARKER_CREATED" | "MARKER_UPDATED" | "MARKER_DELETED";
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: MarkerAuditTarget | "MAP";
};

type CreateMarkerData = { createdByUserId: string; mapId: string; updatedByUserId: string };

export type MarkerStore<K extends MarkerKind> = {
  create(input: KindValid<K> & CreateMarkerData): Promise<KindRecord<K>>;
  find(id: string): Promise<MarkerWithMap<KindRecord<K>> | null>;
  listActive(mapId: string): Promise<Array<KindRecord<K>>>;
  softDelete(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<KindRecord<K> | null>;
  update(id: string, input: KindValid<K> & { updatedByUserId: string }): Promise<KindRecord<K> | null>;
};

export type MarkerServiceDependencies = CanaryDependencies & {
  disbandDeed(input: {
    actorUserId: string;
    categoryName: string;
    deedId: string;
    deletedAt: Date;
    deleteExpiresAt: Date;
    note: NoteMarkerInput & CreateMarkerData;
  }): Promise<{
    category: NoteCategoryRecord;
    deletedDeed: DeedRecord;
    note: NoteRecord;
  } | null>;
  findMap(mapId: string): Promise<MapRecord | null>;
  markers: { [K in MarkerKind]: MarkerStore<K> };
  noteCategoryExists(mapId: string, name: string): Promise<boolean>;
  now(): Date;
  recordAudit(input: MarkerAuditInput): Promise<void>;
};

type FieldReader = {
  bool(key: string): boolean;
  num(key: string): number;
  str(key: string): string;
  xy(): { x: number; y: number };
};

type MarkerKindHandler<K extends MarkerKind> = {
  parse(read: FieldReader, input: object, markerType: PersistedMarkerType): KindInput<K>;
  serialize(record: KindRecord<K>): KindMarker<K>;
  validate(input: KindInput<K>, bounds: MapBounds): Result<KindValid<K>>;
  // Extra check before a write; `existing` is null when creating.
  checkWrite?(
    dependencies: MarkerServiceDependencies,
    mapId: string,
    valid: KindValid<K>,
    existing: KindRecord<K> | null
  ): Promise<Result<true>>;
  // Whether a stored record may be addressed under `markerType`.
  matchesType?(record: KindRecord<K>, markerType: PersistedMarkerType): boolean;
};

const MARKER_KINDS: { [K in MarkerKind]: MarkerKindHandler<K> } = {
  camp: {
    parse: (read) => ({ campType: read.str("campType"), notes: read.str("notes"), ...read.xy() }),
    serialize: serializeCamp,
    validate: validateCampInput
  },
  deed: {
    parse: (read) => ({
      east: read.num("east"),
      foundingDate: read.str("foundingDate"),
      founder: read.str("founder"),
      name: read.str("name"),
      north: read.num("north"),
      perimeter: read.num("perimeter"),
      south: read.num("south"),
      west: read.num("west"),
      ...read.xy()
    }),
    serialize: serializeDeed,
    validate: validateDeedInput
  },
  locateSoul: {
    parse: (read) => ({
      casterFacing: read.str("casterFacing"),
      direction: read.str("direction"),
      distanceBand: read.str("distanceBand"),
      notes: read.str("notes"),
      targetName: read.str("targetName"),
      ...read.xy()
    }),
    serialize: serializeLocateSoul,
    validate: validateLocateSoulInput
  },
  minedoor: {
    parse: (read) => ({ notes: read.str("notes"), strength: read.str("strength"), ...read.xy() }),
    serialize: serializeMinedoor,
    validate: validateMinedoorInput
  },
  note: {
    // Only a new or changed category must exist; an unchanged one is left as-is.
    checkWrite: async (dependencies, mapId, note, existing) => (
      note.category === existing?.category ? ok(true) : requireNoteCategory(dependencies, mapId, note.category)
    ),
    parse: (read) => ({ category: read.str("category"), text: read.str("text"), title: read.str("title"), ...read.xy() }),
    serialize: serializeNote,
    validate: validateNoteInput
  },
  path: {
    matchesType: (path, markerType) => path.pathType === markerType,
    parse: (read, input, markerType) => ({
      name: read.str("name"),
      notes: read.str("notes"),
      points: getPathPoints(input, "points"),
      type: markerType,
      width: read.num("width")
    }),
    serialize: serializePath,
    validate: validatePathInput
  },
  rift: {
    parse: (read) => ({
      arrivalDate: read.str("arrivalDate"),
      estimatedRiftTime: read.str("estimatedRiftTime"),
      notes: read.str("notes"),
      ...read.xy()
    }),
    serialize: serializeRift,
    validate: validateRiftInput
  },
  tower: {
    parse: (read) => ({
      damage: read.str("damage"),
      makerName: read.str("makerName"),
      makerNumber: read.str("makerNumber"),
      planned: read.bool("planned"),
      ql: read.str("ql"),
      towerType: read.str("towerType"),
      ...read.xy()
    }),
    serialize: serializeTower,
    validate: validateTowerInput
  }
};

// Order in which marker kinds are listed.
const LISTED_MARKER_KINDS = ["tower", "deed", "note", "rift", "camp", "minedoor", "locateSoul", "path"] as const;

type ParsedMarkerInput<K extends MarkerKind> = {
  input: KindInput<K>;
  kind: K;
  type: PersistedMarkerType;
};

export async function listMarkers(
  input: { actor: Actor; includeCanaries?: boolean; mapId: string },
  dependencies: MarkerServiceDependencies
): Promise<Result<{ map: WorkspaceMap; markers: WorkspaceMarker[] }>> {
  if (!canReadMap(input.actor, input.mapId)) {
    await auditAuthorizationFailure(dependencies, input.actor, input.mapId, "MARKER_READ");
    return err(READ_ACCESS_REQUIRED);
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err(MAP_NOT_FOUND);
  }

  const serialized: WorkspaceMarker[] = (await Promise.all(
    LISTED_MARKER_KINDS.map((kind) => listActiveKind(kind, map.id, dependencies))
  )).flat();

  if (input.includeCanaries === true) {
    const canaries = await getOrCreateCanaries(
      { mapId: map.id, userId: input.actor.id },
      { heightPx: map.heightPx, widthPx: map.widthPx },
      dependencies
    );
    interleaveCanaries(serialized, canaries);
  }

  return ok({
    map: serializeMap(map),
    markers: serialized
  });
}

async function listActiveKind<K extends MarkerKind>(
  kind: K,
  mapId: string,
  dependencies: MarkerServiceDependencies
): Promise<WorkspaceMarker[]> {
  const records = await dependencies.markers[kind].listActive(mapId);
  return records.map((record) => MARKER_KINDS[kind].serialize(record));
}

// Inserts each canary at a deterministic position derived from its id so
// decoys blend into the served list instead of trailing at the end.
function interleaveCanaries(markers: WorkspaceMarker[], canaries: WorkspaceMarker[]): void {
  for (const canary of canaries) {
    let hash = 0;
    for (let index = 0; index < canary.id.length; index += 1) {
      hash = (Math.imul(hash, 31) + canary.id.charCodeAt(index)) | 0;
    }
    markers.splice(Math.abs(hash) % (markers.length + 1), 0, canary);
  }
}

export async function createMarker(
  input: { actor: Actor; input: unknown; mapId: string },
  dependencies: MarkerServiceDependencies
): Promise<Result<WorkspaceMarker>> {
  const access = await checkWriteAccess(dependencies, input.actor, input.mapId);

  if (!access.ok) {
    return access;
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err(MAP_NOT_FOUND);
  }

  const markerInput = parseMarkerInput(input.input);

  if (!markerInput.ok) {
    return markerInput;
  }

  return createParsedMarker(markerInput.value, map, input.actor, dependencies);
}

async function createParsedMarker<K extends MarkerKind>(
  parsed: ParsedMarkerInput<K>,
  map: MapRecord,
  actor: Actor,
  dependencies: MarkerServiceDependencies
): Promise<Result<WorkspaceMarker>> {
  const validated = await validateMarkerWrite(parsed, map, map.id, null, dependencies);

  if (!validated.ok) {
    return validated;
  }

  const created = await dependencies.markers[parsed.kind].create({
    ...validated.value,
    createdByUserId: actor.id,
    mapId: map.id,
    updatedByUserId: actor.id
  });
  const marker = MARKER_KINDS[parsed.kind].serialize(created);
  await auditMarkerWrite(dependencies, "MARKER_CREATED", actor, map.id, map.name, marker);
  return ok(marker);
}

export async function updateMarker(
  input: {
    actor: Actor;
    input: unknown;
    markerId: string;
    markerType: MarkerType;
  },
  dependencies: MarkerServiceDependencies
): Promise<Result<WorkspaceMarker>> {
  const markerInput = parseMarkerInput(input.input);

  if (!markerInput.ok) {
    return markerInput;
  }

  if (input.markerType !== markerInput.value.type) {
    return err("Marker type mismatch");
  }

  return updateParsedMarker(markerInput.value, input.markerId, input.actor, dependencies);
}

async function updateParsedMarker<K extends MarkerKind>(
  parsed: ParsedMarkerInput<K>,
  markerId: string,
  actor: Actor,
  dependencies: MarkerServiceDependencies
): Promise<Result<WorkspaceMarker>> {
  const existing = await findMarker(parsed.kind, parsed.type, markerId, dependencies);

  if (existing === null) {
    return err(MARKER_NOT_FOUND);
  }

  const access = await checkWriteAccess(dependencies, actor, existing.mapId);

  if (!access.ok) {
    return access;
  }

  const validated = await validateMarkerWrite(parsed, existing.map, existing.mapId, existing, dependencies);

  if (!validated.ok) {
    return validated;
  }

  const updated = await dependencies.markers[parsed.kind].update(markerId, {
    ...validated.value,
    updatedByUserId: actor.id
  });

  if (updated === null) {
    return err(MARKER_NOT_FOUND);
  }

  const marker = MARKER_KINDS[parsed.kind].serialize(updated);
  await auditMarkerWrite(dependencies, "MARKER_UPDATED", actor, existing.mapId, existing.map.name, marker);
  return ok(marker);
}

async function validateMarkerWrite<K extends MarkerKind>(
  parsed: ParsedMarkerInput<K>,
  bounds: MapBounds,
  mapId: string,
  existing: KindRecord<K> | null,
  dependencies: MarkerServiceDependencies
): Promise<Result<KindValid<K>>> {
  const handler = MARKER_KINDS[parsed.kind];
  const validated = handler.validate(parsed.input, bounds);

  if (!validated.ok || handler.checkWrite === undefined) {
    return validated;
  }

  const checked = await handler.checkWrite(dependencies, mapId, validated.value, existing);
  return checked.ok ? validated : checked;
}

// A marker is found only while live and addressable under the requested type
// (a path id addressed under a different path type is treated as not found).
async function findMarker<K extends MarkerKind>(
  kind: K,
  markerType: PersistedMarkerType,
  markerId: string,
  dependencies: MarkerServiceDependencies
): Promise<MarkerWithMap<KindRecord<K>> | null> {
  const existing = await dependencies.markers[kind].find(markerId);
  return existing === null || MARKER_KINDS[kind].matchesType?.(existing, markerType) === false ? null : existing;
}

export async function disbandDeedMarker(
  input: {
    actor: Actor;
    markerId: string;
  },
  dependencies: MarkerServiceDependencies
): Promise<Result<{
  category: NoteCategory;
  deletedMarkerId: string;
  marker: NoteWorkspaceMarker;
}>> {
  const existing = await dependencies.markers.deed.find(input.markerId);

  if (existing === null) {
    return err(MARKER_NOT_FOUND);
  }

  const access = await checkWriteAccess(dependencies, input.actor, existing.mapId);

  if (!access.ok) {
    return access;
  }

  const note = validateNoteInput({
    category: ABANDONED_DEED_CATEGORY_NAME,
    text: formatDisbandedDeedNoteText(existing),
    title: existing.name,
    x: existing.x,
    y: existing.y
  }, existing.map);

  if (!note.ok) {
    return note;
  }

  const deletedAt = dependencies.now();
  const conversion = await dependencies.disbandDeed({
    actorUserId: input.actor.id,
    categoryName: ABANDONED_DEED_CATEGORY_NAME,
    deedId: existing.id,
    deletedAt,
    deleteExpiresAt: getDeleteExpiresAt(deletedAt),
    note: {
      ...note.value,
      createdByUserId: input.actor.id,
      mapId: existing.mapId,
      updatedByUserId: input.actor.id
    }
  });

  if (conversion === null) {
    return err(MARKER_NOT_FOUND);
  }

  const marker = serializeNote(conversion.note);

  await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, existing.mapId, existing.map.name, marker);
  await recordAudit(dependencies, {
    action: "MARKER_DELETED",
    actorUserId: input.actor.id,
    mapId: existing.mapId,
    metadata: {
      convertedTo: "note",
      markerType: "deed",
      noteCategory: conversion.category.name,
      x: existing.x,
      y: existing.y
    },
    targetId: conversion.deletedDeed.id,
    targetType: "DEED"
  });
  triggerAlertsSafely();

  return ok({
    category: serializeNoteCategory(conversion.category),
    deletedMarkerId: conversion.deletedDeed.id,
    marker
  });
}

function parseMarkerInput(input: unknown): Result<ParsedMarkerInput<MarkerKind>> {
  if (typeof input !== "object" || input === null || !("type" in input)) {
    return err("Marker input is required");
  }

  if (typeof input.type !== "string" || !isPersistedMarkerType(input.type)) {
    return err("Marker type is invalid");
  }

  const read: FieldReader = {
    bool: (key) => getBoolean(input, key),
    num: (key) => getNumber(input, key),
    str: (key) => getString(input, key),
    xy: () => ({ x: getNumber(input, "x"), y: getNumber(input, "y") })
  };

  return ok(parseKindInput(getMarkerKind(input.type), input.type, read, input));
}

function parseKindInput<K extends MarkerKind>(
  kind: K,
  type: PersistedMarkerType,
  read: FieldReader,
  input: object
): ParsedMarkerInput<K> {
  return { input: MARKER_KINDS[kind].parse(read, input, type), kind, type };
}

function getString(input: object, key: string): string {
  if (!(key in input)) {
    return "";
  }

  const value = input[key as keyof typeof input];
  return typeof value === "string" ? value : "";
}

function getNumber(input: object, key: string): number {
  if (!(key in input)) {
    return Number.NaN;
  }

  const value = input[key as keyof typeof input];
  return typeof value === "number" ? value : Number.NaN;
}

function getBoolean(input: object, key: string): boolean {
  if (!(key in input)) {
    return false;
  }

  const value = input[key as keyof typeof input];
  return value === true;
}

export async function deleteMarker(
  input: { actor: Actor; markerId: string; markerType: PersistedMarkerType },
  dependencies: MarkerServiceDependencies
): Promise<Result<{
  deletedAt: Date;
  deleteExpiresAt: Date;
  markerId: string;
  markerType: PersistedMarkerType;
}>> {
  const kind = getMarkerKind(input.markerType);
  const existing = await findMarker(kind, input.markerType, input.markerId, dependencies);

  if (existing === null) {
    return err(MARKER_NOT_FOUND);
  }

  const access = await checkWriteAccess(dependencies, input.actor, existing.mapId);

  if (!access.ok) {
    return access;
  }

  const deletedAt = dependencies.now();
  const deleteExpiresAt = getDeleteExpiresAt(deletedAt);
  const deleted = await dependencies.markers[kind].softDelete(input.markerId, {
    deletedAt,
    deletedByUserId: input.actor.id,
    deleteExpiresAt
  });

  if (deleted === null) {
    return err(MARKER_NOT_FOUND);
  }

  await recordAudit(dependencies, {
    action: "MARKER_DELETED",
    actorUserId: input.actor.id,
    mapId: deleted.mapId,
    metadata: {
      markerType: input.markerType,
      x: deleted.x,
      y: deleted.y
    },
    targetId: deleted.id,
    targetType: MARKER_AUDIT_TARGETS[kind]
  });
  triggerAlertsSafely();
  dispatchDiscordSafely({
    kind: "marker",
    action: "deleted",
    username: input.actor.username,
    mapName: existing.map.name,
    markerType: input.markerType
  });

  return ok({
    deletedAt,
    deleteExpiresAt,
    markerId: deleted.id,
    markerType: input.markerType
  });
}

function serializeMap(map: MapRecord): WorkspaceMap {
  return {
    heightPx: map.heightPx,
    id: map.id,
    imageSrc: map.imagePath,
    layers: serializeMapLayers(map),
    name: map.name,
    widthPx: map.widthPx
  };
}

function serializeMapLayers(map: MapRecord): WorkspaceMap["layers"] {
  if (map.layers !== undefined && map.layers.length > 0) {
    return map.layers.map((layer) => ({
      heightPx: layer.heightPx,
      id: layer.id,
      imageSrc: layer.imagePath,
      isDefault: layer.isDefault,
      name: layer.name,
      widthPx: layer.widthPx
    }));
  }

  return [
    {
      heightPx: map.heightPx,
      id: `${map.id}:default`,
      imageSrc: map.imagePath,
      isDefault: true,
      name: "Terrain",
      widthPx: map.widthPx
    }
  ];
}

function serializeTower(tower: TowerRecord): TowerWorkspaceMarker {
  return {
    damage: formatOptionalHundredths(tower.damageHundredths),
    id: tower.id,
    lastModifiedBy: getLastModifiedBy(tower),
    makerName: tower.makerName,
    makerNumber: tower.makerNumber,
    planned: tower.planned,
    ql: formatOptionalHundredths(tower.qlHundredths),
    towerType: normalizeTowerRecordType(tower.towerType),
    type: "tower",
    x: tower.x,
    y: tower.y
  };
}

function normalizeTowerRecordType(value: string): TowerType {
  return TOWER_TYPES.find((towerType) => towerType === value) ?? DEFAULT_TOWER_TYPE;
}

function formatOptionalHundredths(value: number | null): string {
  return value === null ? "" : formatHundredths(value);
}

function serializeDeed(deed: DeedRecord): DeedWorkspaceMarker {
  return {
    east: deed.east,
    foundingDate: formatOptionalDate(deed.foundingDate),
    founder: deed.founder,
    id: deed.id,
    lastModifiedBy: getLastModifiedBy(deed),
    name: deed.name,
    north: deed.north,
    perimeter: deed.perimeter,
    south: deed.south,
    type: "deed",
    west: deed.west,
    x: deed.x,
    y: deed.y
  };
}

function getPathPoints(input: object, key: string): Array<{ x: number; y: number }> {
  if (!(key in input)) {
    return [];
  }

  const value = (input as Record<string, unknown>)[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((point) => {
    if (typeof point !== "object" || point === null) {
      return { x: Number.NaN, y: Number.NaN };
    }

    return {
      x: getNumber(point, "x"),
      y: getNumber(point, "y")
    };
  });
}

function formatOptionalDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function getLastModifiedBy(marker: MarkerModifierRecord): string {
  return marker.updatedBy?.username ?? marker.createdBy?.username ?? "Unknown";
}

function serializeNote(note: NoteRecord): NoteWorkspaceMarker {
  return {
    category: note.category,
    id: note.id,
    lastModifiedBy: getLastModifiedBy(note),
    text: note.text,
    title: note.title,
    type: "note",
    x: note.x,
    y: note.y
  };
}

function serializeNoteCategory(category: NoteCategoryRecord): NoteCategory {
  return {
    color: category.color,
    id: category.id,
    markerShape: normalizeNoteCategoryMarkerShape(category.markerShape),
    name: category.name,
    pipSize: Math.min(MAX_NOTE_CATEGORY_PIP_SIZE, Math.max(MIN_NOTE_CATEGORY_PIP_SIZE, Math.round(category.pipSize)))
  };
}

export function normalizeNoteCategoryMarkerShape(value: string): NoteCategoryMarkerShape {
  return NOTE_CATEGORY_MARKER_SHAPES.find((shape) => shape === value) ?? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE;
}

function serializeRift(rift: RiftRecord): RiftWorkspaceMarker {
  return {
    arrivalDate: formatOptionalDate(rift.arrivalDate),
    estimatedRiftTime: formatOptionalDateTime(rift.estimatedRiftTime),
    id: rift.id,
    lastModifiedBy: getLastModifiedBy(rift),
    notes: rift.notes,
    type: "rift",
    x: rift.x,
    y: rift.y
  };
}

function serializeCamp(camp: CampRecord): CampWorkspaceMarker {
  return {
    campType: camp.campType === "Goblin" ? "Goblin" : "Rift",
    id: camp.id,
    lastModifiedBy: getLastModifiedBy(camp),
    notes: camp.notes,
    type: "camp",
    x: camp.x,
    y: camp.y
  };
}

function serializeMinedoor(minedoor: MinedoorRecord): MinedoorWorkspaceMarker {
  return {
    id: minedoor.id,
    lastModifiedBy: getLastModifiedBy(minedoor),
    notes: minedoor.notes,
    strength: minedoor.strength,
    type: "minedoor",
    x: minedoor.x,
    y: minedoor.y
  };
}

function serializeLocateSoul(locateSoul: LocateSoulRecord): LocateSoulWorkspaceMarker {
  return {
    casterFacing: normalizeStoredLocateSoulFacing(locateSoul.casterFacing),
    direction: normalizeStoredLocateSoulDirection(locateSoul.direction),
    distanceBand: normalizeStoredLocateSoulDistanceBand(locateSoul.distanceBand),
    id: locateSoul.id,
    lastModifiedBy: getLastModifiedBy(locateSoul),
    notes: locateSoul.notes,
    targetName: locateSoul.targetName,
    type: "locateSoul",
    x: locateSoul.x,
    y: locateSoul.y
  };
}

function normalizeStoredLocateSoulFacing(value: string): LocateSoulWorkspaceMarker["casterFacing"] {
  return isLocateSoulCasterFacing(value) ? value : "north";
}

function normalizeStoredLocateSoulDirection(value: string): LocateSoulWorkspaceMarker["direction"] {
  return isLocateSoulDirection(value) ? value : "ahead";
}

function normalizeStoredLocateSoulDistanceBand(value: string): LocateSoulWorkspaceMarker["distanceBand"] {
  return isLocateSoulDistanceBandKey(value) ? value : "20-49";
}

function serializePath(path: PathRecord): PathWorkspaceMarker {
  return {
    id: path.id,
    lastModifiedBy: getLastModifiedBy(path),
    name: path.name,
    notes: path.notes,
    points: path.points,
    type: normalizeStoredPathType(path.pathType),
    width: path.width,
    x: path.x,
    y: path.y
  };
}

function normalizeStoredPathType(pathType: string): PathType {
  return isPathMarkerType(pathType) ? pathType : "bridge";
}

function formatDisbandedDeedNoteText(deed: DeedRecord): string {
  return [
    `Former deed: ${deed.name}`,
    `Mayor: ${deed.founder}`,
    `Founding date: ${formatOptionalDate(deed.foundingDate) ?? "Unknown"}`,
    `Dimensions: N${deed.north} W${deed.west} E${deed.east} S${deed.south}`,
    `Perimeter: ${deed.perimeter} tiles`,
    `Coordinates: ${deed.x}, ${deed.y}`
  ].join("\n");
}

function formatOptionalDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 16);
}

async function auditAuthorizationFailure(
  dependencies: MarkerServiceDependencies,
  actor: Actor,
  mapId: string | null,
  attemptedAction: "MARKER_READ" | "MARKER_WRITE"
): Promise<void> {
  await recordAudit(dependencies, {
    action: "FAILED_AUTHORIZATION",
    actorUserId: actor.id,
    mapId,
    metadata: { attemptedAction },
    targetId: mapId,
    targetType: "MAP"
  });
  triggerAlertsSafely();
}

// Audits and rejects an actor without write access to the map.
async function checkWriteAccess(
  dependencies: MarkerServiceDependencies,
  actor: Actor,
  mapId: string
): Promise<Result<true>> {
  if (canWriteMarkers(actor, mapId)) {
    return ok(true);
  }

  await auditAuthorizationFailure(dependencies, actor, mapId, "MARKER_WRITE");
  return err(WRITE_ACCESS_REQUIRED);
}

async function requireNoteCategory(
  dependencies: MarkerServiceDependencies,
  mapId: string,
  category: string
): Promise<Result<true>> {
  if (!await dependencies.noteCategoryExists(mapId, category)) {
    return err("Note category does not exist on this map");
  }

  return ok(true);
}

async function auditMarkerWrite(
  dependencies: MarkerServiceDependencies,
  action: "MARKER_CREATED" | "MARKER_UPDATED",
  actor: Actor,
  mapId: string,
  mapName: string,
  marker: PersistedWorkspaceMarker
): Promise<void> {
  await recordAudit(dependencies, {
    action,
    actorUserId: actor.id,
    mapId,
    metadata: {
      markerType: marker.type,
      placementDistanceTiles:
        marker.type === "tower" ? TOWER_PLACEMENT_DISTANCE_TILES : undefined,
      protectionDistanceTiles:
        marker.type === "tower" ? TOWER_PROTECTION_DISTANCE_TILES : undefined,
      x: marker.x,
      y: marker.y
    },
    targetId: marker.id,
    targetType: MARKER_AUDIT_TARGETS[getMarkerKind(marker.type)]
  });
  dispatchDiscordSafely({
    kind: "marker",
    action: action === "MARKER_CREATED" ? "created" : "updated",
    username: actor.username,
    mapName,
    markerType: marker.type
  });
}

async function recordAudit(
  dependencies: MarkerServiceDependencies,
  input: MarkerAuditInput
): Promise<void> {
  const metadata = removeUndefined(input.metadata);
  assertNoCoordinateMetadata(metadata);
  await dependencies.recordAudit({ ...input, metadata });
}

function removeUndefined(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
}
