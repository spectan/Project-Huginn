import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import { getDeleteExpiresAt } from "@/lib/domain/deletion";
import {
  validateDeedInput,
  validateNoteInput,
  validateTowerInput,
  type DeedMarkerInput,
  type NoteMarkerInput,
  type TowerMarkerInput
} from "@/lib/domain/markers";
import { formatHundredths } from "@/lib/domain/number-fields";
import {
  canReadMap,
  canWriteMarkers,
  type UserAccess
} from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import type {
  DeedWorkspaceMarker,
  MarkerType,
  NoteWorkspaceMarker,
  TowerWorkspaceMarker,
  WorkspaceMap,
  WorkspaceMarker
} from "./marker-types";

type Actor = UserAccess & {
  id: string;
};

type MapRecord = {
  heightPx: number;
  id: string;
  imagePath: string;
  name: string;
  widthPx: number;
};

type TowerRecord = TowerMarkerInput & {
  id: string;
  mapId: string;
};

type DeedRecord = DeedMarkerInput & {
  id: string;
  mapId: string;
};

type NoteRecord = NoteMarkerInput & {
  id: string;
  mapId: string;
};

type MarkerWithMap<T> = T & {
  map: MapRecord;
};

type MarkerAuditAction =
  | "FAILED_AUTHORIZATION"
  | "MARKER_CREATED"
  | "MARKER_UPDATED"
  | "MARKER_DELETED"
  | "MARKER_LIST_VIEW";

type MarkerAuditTarget = "TOWER" | "DEED" | "NOTE" | "MAP";

type MarkerAuditInput = {
  action: MarkerAuditAction;
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: MarkerAuditTarget;
};

export type MarkerServiceDependencies = {
  createDeed(input: DeedMarkerInput & { createdByUserId: string; mapId: string }): Promise<DeedRecord>;
  createNote(input: NoteMarkerInput & { createdByUserId: string; mapId: string }): Promise<NoteRecord>;
  createTower(input: TowerMarkerInput & { createdByUserId: string; mapId: string }): Promise<TowerRecord>;
  findDeed(id: string): Promise<MarkerWithMap<DeedRecord> | null>;
  findMap(mapId: string): Promise<MapRecord | null>;
  findNote(id: string): Promise<MarkerWithMap<NoteRecord> | null>;
  findTower(id: string): Promise<MarkerWithMap<TowerRecord> | null>;
  listActiveMarkers(mapId: string): Promise<{
    deeds: DeedRecord[];
    notes: NoteRecord[];
    towers: TowerRecord[];
  }>;
  now(): Date;
  recordAudit(input: MarkerAuditInput): Promise<void>;
  softDeleteDeed(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<DeedRecord | null>;
  softDeleteNote(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<NoteRecord | null>;
  softDeleteTower(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<TowerRecord | null>;
  updateDeed(id: string, input: DeedMarkerInput & { updatedByUserId: string }): Promise<DeedRecord | null>;
  updateNote(id: string, input: NoteMarkerInput & { updatedByUserId: string }): Promise<NoteRecord | null>;
  updateTower(id: string, input: TowerMarkerInput & { updatedByUserId: string }): Promise<TowerRecord | null>;
};

export type CreateMarkerInput =
  | ({ type: "tower" } & {
      damage: string;
      makerName: string;
      makerNumber: string;
      ql: string;
      x: number;
      y: number;
    })
  | ({ type: "deed" } & {
      east: number;
      founder: string;
      name: string;
      north: number;
      south: number;
      west: number;
      x: number;
      y: number;
    })
  | ({ type: "note" } & {
      category: string;
      text: string;
      title: string;
      x: number;
      y: number;
    });

export async function listMarkers(
  input: { actor: Actor; mapId: string },
  dependencies: MarkerServiceDependencies
): Promise<Result<{ map: WorkspaceMap; markers: WorkspaceMarker[] }>> {
  if (!canReadMap(input.actor)) {
    await auditAuthorizationFailure(dependencies, input.actor, input.mapId);
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const markers = await dependencies.listActiveMarkers(map.id);

  await recordAudit(dependencies, {
    action: "MARKER_LIST_VIEW",
    actorUserId: input.actor.id,
    mapId: map.id,
    metadata: { markerCount: markers.towers.length + markers.deeds.length + markers.notes.length },
    targetId: map.id,
    targetType: "MAP"
  });

  return ok({
    map: serializeMap(map),
    markers: [
      ...markers.towers.map(serializeTower),
      ...markers.deeds.map(serializeDeed),
      ...markers.notes.map(serializeNote)
    ]
  });
}

export async function createMarker(
  input: { actor: Actor; input: unknown; mapId: string },
  dependencies: MarkerServiceDependencies
): Promise<Result<WorkspaceMarker>> {
  if (!canWriteMarkers(input.actor)) {
    await auditAuthorizationFailure(dependencies, input.actor, input.mapId);
    return err("Write access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const bounds = { heightPx: map.heightPx, widthPx: map.widthPx };
  const markerInput = parseMarkerInput(input.input);

  if (!markerInput.ok) {
    return markerInput;
  }

  if (markerInput.value.type === "tower") {
    const tower = validateTowerInput(markerInput.value, bounds);

    if (!tower.ok) {
      return tower;
    }

    const created = await dependencies.createTower({
      ...tower.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializeTower(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  if (markerInput.value.type === "deed") {
    const deed = validateDeedInput(markerInput.value, bounds);

    if (!deed.ok) {
      return deed;
    }

    const created = await dependencies.createDeed({
      ...deed.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializeDeed(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  const note = validateNoteInput(markerInput.value, bounds);

  if (!note.ok) {
    return note;
  }

  const created = await dependencies.createNote({
    ...note.value,
    createdByUserId: input.actor.id,
    mapId: map.id
  });
  const marker = serializeNote(created);
  await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
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
  if (!canWriteMarkers(input.actor)) {
    await auditAuthorizationFailure(dependencies, input.actor, null);
    return err("Write access is required");
  }

  const markerInput = parseMarkerInput(input.input);

  if (!markerInput.ok) {
    return markerInput;
  }

  if (input.markerType !== markerInput.value.type) {
    return err("Marker type mismatch");
  }

  if (input.markerType === "tower") {
    const existing = await dependencies.findTower(input.markerId);

    if (existing === null || markerInput.value.type !== "tower") {
      return err("Marker was not found");
    }

    const validated = validateTowerInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateTower(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeTower(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
    return ok(marker);
  }

  if (input.markerType === "deed") {
    const existing = await dependencies.findDeed(input.markerId);

    if (existing === null || markerInput.value.type !== "deed") {
      return err("Marker was not found");
    }

    const validated = validateDeedInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateDeed(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeDeed(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
    return ok(marker);
  }

  const existing = await dependencies.findNote(input.markerId);

  if (existing === null || markerInput.value.type !== "note") {
    return err("Marker was not found");
  }

  const validated = validateNoteInput(markerInput.value, existing.map);
  if (!validated.ok) {
    return validated;
  }

  const updated = await dependencies.updateNote(input.markerId, {
    ...validated.value,
    updatedByUserId: input.actor.id
  });

  if (updated === null) {
    return err("Marker was not found");
  }

  const marker = serializeNote(updated);
  await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
  return ok(marker);
}

function parseMarkerInput(input: unknown): Result<CreateMarkerInput> {
  if (typeof input !== "object" || input === null || !("type" in input)) {
    return err("Marker input is required");
  }

  if (input.type === "tower") {
    return ok({
      damage: getString(input, "damage"),
      makerName: getString(input, "makerName"),
      makerNumber: getString(input, "makerNumber"),
      ql: getString(input, "ql"),
      type: "tower",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "deed") {
    return ok({
      east: getNumber(input, "east"),
      founder: getString(input, "founder"),
      name: getString(input, "name"),
      north: getNumber(input, "north"),
      south: getNumber(input, "south"),
      type: "deed",
      west: getNumber(input, "west"),
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "note") {
    return ok({
      category: getString(input, "category"),
      text: getString(input, "text"),
      title: getString(input, "title"),
      type: "note",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  return err("Marker type is invalid");
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

export async function deleteMarker(
  input: { actor: Actor; markerId: string; markerType: MarkerType },
  dependencies: MarkerServiceDependencies
): Promise<Result<{
  deletedAt: Date;
  deleteExpiresAt: Date;
  markerId: string;
  markerType: MarkerType;
}>> {
  if (!canWriteMarkers(input.actor)) {
    await auditAuthorizationFailure(dependencies, input.actor, null);
    return err("Write access is required");
  }

  const deletedAt = dependencies.now();
  const deleteExpiresAt = getDeleteExpiresAt(deletedAt);
  const softDeleteInput = {
    deletedAt,
    deletedByUserId: input.actor.id,
    deleteExpiresAt
  };
  const deleted = await softDeleteMarker(input, softDeleteInput, dependencies);

  if (deleted === null) {
    return err("Marker was not found");
  }

  await recordAudit(dependencies, {
    action: "MARKER_DELETED",
    actorUserId: input.actor.id,
    mapId: deleted.mapId,
    metadata: { markerType: input.markerType },
    targetId: deleted.id,
    targetType: getAuditTargetType(input.markerType)
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
    name: map.name,
    widthPx: map.widthPx
  };
}

function serializeTower(tower: TowerRecord): TowerWorkspaceMarker {
  return {
    damage: formatHundredths(tower.damageHundredths),
    id: tower.id,
    makerName: tower.makerName,
    makerNumber: tower.makerNumber,
    ql: formatHundredths(tower.qlHundredths),
    type: "tower",
    x: tower.x,
    y: tower.y
  };
}

function serializeDeed(deed: DeedRecord): DeedWorkspaceMarker {
  return {
    east: deed.east,
    founder: deed.founder,
    id: deed.id,
    name: deed.name,
    north: deed.north,
    south: deed.south,
    type: "deed",
    west: deed.west,
    x: deed.x,
    y: deed.y
  };
}

function serializeNote(note: NoteRecord): NoteWorkspaceMarker {
  return {
    category: note.category,
    id: note.id,
    text: note.text,
    title: note.title,
    type: "note",
    x: note.x,
    y: note.y
  };
}

async function softDeleteMarker(
  input: { markerId: string; markerType: MarkerType },
  softDeleteInput: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date },
  dependencies: MarkerServiceDependencies
): Promise<(TowerRecord | DeedRecord | NoteRecord) | null> {
  if (input.markerType === "tower") {
    return dependencies.softDeleteTower(input.markerId, softDeleteInput);
  }

  if (input.markerType === "deed") {
    return dependencies.softDeleteDeed(input.markerId, softDeleteInput);
  }

  return dependencies.softDeleteNote(input.markerId, softDeleteInput);
}

async function auditAuthorizationFailure(
  dependencies: MarkerServiceDependencies,
  actor: Actor,
  mapId: string | null
): Promise<void> {
  await recordAudit(dependencies, {
    action: "FAILED_AUTHORIZATION",
    actorUserId: actor.id,
    mapId,
    metadata: { attemptedAction: "MARKER_WRITE" },
    targetId: mapId,
    targetType: "MAP"
  });
}

async function auditMarkerWrite(
  dependencies: MarkerServiceDependencies,
  action: "MARKER_CREATED" | "MARKER_UPDATED",
  actor: Actor,
  mapId: string,
  marker: WorkspaceMarker
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
        marker.type === "tower" ? TOWER_PROTECTION_DISTANCE_TILES : undefined
    },
    targetId: marker.id,
    targetType: getAuditTargetType(marker.type)
  });
}

function getAuditTargetType(markerType: MarkerType): MarkerAuditTarget {
  if (markerType === "tower") {
    return "TOWER";
  }

  if (markerType === "deed") {
    return "DEED";
  }

  return "NOTE";
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
