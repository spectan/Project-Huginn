import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import { getDeleteExpiresAt } from "@/lib/domain/deletion";
import {
  validateCampInput,
  validateDeedInput,
  validateMinedoorInput,
  validateNoteInput,
  validatePathInput,
  validateRiftInput,
  validateTowerInput,
  type CampMarkerInput,
  type DeedMarkerInput,
  type MinedoorMarkerInput,
  type NoteMarkerInput,
  type PathMarkerInput,
  type PathType,
  type RiftMarkerInput,
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
  CampWorkspaceMarker,
  DeedWorkspaceMarker,
  MarkerType,
  MinedoorWorkspaceMarker,
  NoteWorkspaceMarker,
  PathWorkspaceMarker,
  RiftWorkspaceMarker,
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

type RiftRecord = RiftMarkerInput & {
  id: string;
  mapId: string;
};

type CampRecord = Omit<CampMarkerInput, "campType"> & {
  campType: string;
  id: string;
  mapId: string;
};

type MinedoorRecord = MinedoorMarkerInput & {
  id: string;
  mapId: string;
};

type PathRecord = Omit<PathMarkerInput, "pathType"> & {
  id: string;
  mapId: string;
  pathType: string;
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

type MarkerAuditTarget = "TOWER" | "DEED" | "NOTE" | "RIFT" | "CAMP" | "MINEDOOR" | "PATH" | "MAP";

type MarkerAuditInput = {
  action: MarkerAuditAction;
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: MarkerAuditTarget;
};

export type MarkerServiceDependencies = {
  createCamp(input: CampMarkerInput & { createdByUserId: string; mapId: string }): Promise<CampRecord>;
  createDeed(input: DeedMarkerInput & { createdByUserId: string; mapId: string }): Promise<DeedRecord>;
  createMinedoor(input: MinedoorMarkerInput & { createdByUserId: string; mapId: string }): Promise<MinedoorRecord>;
  createNote(input: NoteMarkerInput & { createdByUserId: string; mapId: string }): Promise<NoteRecord>;
  createPath(input: PathMarkerInput & { createdByUserId: string; mapId: string }): Promise<PathRecord>;
  createRift(input: RiftMarkerInput & { createdByUserId: string; mapId: string }): Promise<RiftRecord>;
  createTower(input: TowerMarkerInput & { createdByUserId: string; mapId: string }): Promise<TowerRecord>;
  findCamp(id: string): Promise<MarkerWithMap<CampRecord> | null>;
  findDeed(id: string): Promise<MarkerWithMap<DeedRecord> | null>;
  findMap(mapId: string): Promise<MapRecord | null>;
  findMinedoor(id: string): Promise<MarkerWithMap<MinedoorRecord> | null>;
  findNote(id: string): Promise<MarkerWithMap<NoteRecord> | null>;
  findPath(id: string): Promise<MarkerWithMap<PathRecord> | null>;
  findRift(id: string): Promise<MarkerWithMap<RiftRecord> | null>;
  findTower(id: string): Promise<MarkerWithMap<TowerRecord> | null>;
  listActiveMarkers(mapId: string): Promise<{
    camps: CampRecord[];
    deeds: DeedRecord[];
    minedoors: MinedoorRecord[];
    notes: NoteRecord[];
    paths: PathRecord[];
    rifts: RiftRecord[];
    towers: TowerRecord[];
  }>;
  now(): Date;
  recordAudit(input: MarkerAuditInput): Promise<void>;
  softDeleteCamp(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<CampRecord | null>;
  softDeleteDeed(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<DeedRecord | null>;
  softDeleteMinedoor(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<MinedoorRecord | null>;
  softDeleteNote(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<NoteRecord | null>;
  softDeletePath(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<PathRecord | null>;
  softDeleteRift(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<RiftRecord | null>;
  softDeleteTower(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<TowerRecord | null>;
  updateCamp(id: string, input: CampMarkerInput & { updatedByUserId: string }): Promise<CampRecord | null>;
  updateDeed(id: string, input: DeedMarkerInput & { updatedByUserId: string }): Promise<DeedRecord | null>;
  updateMinedoor(id: string, input: MinedoorMarkerInput & { updatedByUserId: string }): Promise<MinedoorRecord | null>;
  updateNote(id: string, input: NoteMarkerInput & { updatedByUserId: string }): Promise<NoteRecord | null>;
  updatePath(id: string, input: PathMarkerInput & { updatedByUserId: string }): Promise<PathRecord | null>;
  updateRift(id: string, input: RiftMarkerInput & { updatedByUserId: string }): Promise<RiftRecord | null>;
  updateTower(id: string, input: TowerMarkerInput & { updatedByUserId: string }): Promise<TowerRecord | null>;
};

type PathCreateMarkerInput = { type: PathType } & {
  name: string;
  notes: string;
  points: Array<{ x: number; y: number }>;
  width: number;
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
      foundingDate: string;
      founder: string;
      name: string;
      north: number;
      perimeter: number;
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
    })
  | ({ type: "rift" } & {
      arrivalDate: string;
      estimatedRiftTime: string;
      notes: string;
      x: number;
      y: number;
    })
  | ({ type: "camp" } & {
      campType: string;
      notes: string;
      x: number;
      y: number;
    })
  | ({ type: "minedoor" } & {
      notes: string;
      strength: string;
      x: number;
      y: number;
    })
  | PathCreateMarkerInput;

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
    metadata: {
      markerCount:
        markers.towers.length +
        markers.deeds.length +
        markers.notes.length +
        markers.rifts.length +
        markers.camps.length +
        markers.minedoors.length +
        markers.paths.length
    },
    targetId: map.id,
    targetType: "MAP"
  });

  return ok({
    map: serializeMap(map),
    markers: [
      ...markers.towers.map(serializeTower),
      ...markers.deeds.map(serializeDeed),
      ...markers.notes.map(serializeNote),
      ...markers.rifts.map(serializeRift),
      ...markers.camps.map(serializeCamp),
      ...markers.minedoors.map(serializeMinedoor),
      ...markers.paths.map(serializePath)
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

  if (markerInput.value.type === "rift") {
    const rift = validateRiftInput(markerInput.value, bounds);

    if (!rift.ok) {
      return rift;
    }

    const created = await dependencies.createRift({
      ...rift.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializeRift(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  if (markerInput.value.type === "camp") {
    const camp = validateCampInput(markerInput.value, bounds);

    if (!camp.ok) {
      return camp;
    }

    const created = await dependencies.createCamp({
      ...camp.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializeCamp(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  if (markerInput.value.type === "minedoor") {
    const minedoor = validateMinedoorInput(markerInput.value, bounds);

    if (!minedoor.ok) {
      return minedoor;
    }

    const created = await dependencies.createMinedoor({
      ...minedoor.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializeMinedoor(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  if (isPathCreateMarkerInput(markerInput.value)) {
    const path = validatePathInput(markerInput.value, bounds);

    if (!path.ok) {
      return path;
    }

    const created = await dependencies.createPath({
      ...path.value,
      createdByUserId: input.actor.id,
      mapId: map.id
    });
    const marker = serializePath(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, marker);
    return ok(marker);
  }

  if (markerInput.value.type !== "note") {
    return err("Marker type is invalid");
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

  if (input.markerType === "rift") {
    const existing = await dependencies.findRift(input.markerId);

    if (existing === null || markerInput.value.type !== "rift") {
      return err("Marker was not found");
    }

    const validated = validateRiftInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateRift(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeRift(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
    return ok(marker);
  }

  if (input.markerType === "camp") {
    const existing = await dependencies.findCamp(input.markerId);

    if (existing === null || markerInput.value.type !== "camp") {
      return err("Marker was not found");
    }

    const validated = validateCampInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateCamp(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeCamp(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
    return ok(marker);
  }

  if (input.markerType === "minedoor") {
    const existing = await dependencies.findMinedoor(input.markerId);

    if (existing === null || markerInput.value.type !== "minedoor") {
      return err("Marker was not found");
    }

    const validated = validateMinedoorInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateMinedoor(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeMinedoor(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, marker);
    return ok(marker);
  }

  if (isPathMarkerType(input.markerType)) {
    const existing = await dependencies.findPath(input.markerId);

    if (existing === null || !isPathCreateMarkerInput(markerInput.value) || existing.pathType !== input.markerType) {
      return err("Marker was not found");
    }

    const validated = validatePathInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updatePath(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializePath(updated);
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
      foundingDate: getString(input, "foundingDate"),
      founder: getString(input, "founder"),
      name: getString(input, "name"),
      north: getNumber(input, "north"),
      perimeter: getNumber(input, "perimeter"),
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

  if (input.type === "rift") {
    return ok({
      arrivalDate: getString(input, "arrivalDate"),
      estimatedRiftTime: getString(input, "estimatedRiftTime"),
      notes: getString(input, "notes"),
      type: "rift",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "camp") {
    return ok({
      campType: getString(input, "campType"),
      notes: getString(input, "notes"),
      type: "camp",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "minedoor") {
    return ok({
      notes: getString(input, "notes"),
      strength: getString(input, "strength"),
      type: "minedoor",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "bridge" || input.type === "canal" || input.type === "highway") {
    return ok({
      name: getString(input, "name"),
      notes: getString(input, "notes"),
      points: getPathPoints(input, "points"),
      type: input.type,
      width: getNumber(input, "width")
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
    foundingDate: formatOptionalDate(deed.foundingDate),
    founder: deed.founder,
    id: deed.id,
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

function serializeRift(rift: RiftRecord): RiftWorkspaceMarker {
  return {
    arrivalDate: formatOptionalDate(rift.arrivalDate),
    estimatedRiftTime: formatOptionalDateTime(rift.estimatedRiftTime),
    id: rift.id,
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
    notes: camp.notes,
    type: "camp",
    x: camp.x,
    y: camp.y
  };
}

function serializeMinedoor(minedoor: MinedoorRecord): MinedoorWorkspaceMarker {
  return {
    id: minedoor.id,
    notes: minedoor.notes,
    strength: minedoor.strength,
    type: "minedoor",
    x: minedoor.x,
    y: minedoor.y
  };
}

function serializePath(path: PathRecord): PathWorkspaceMarker {
  return {
    id: path.id,
    name: path.name,
    notes: path.notes,
    points: path.points,
    type: normalizeStoredPathType(path.pathType),
    width: path.width,
    x: path.x,
    y: path.y
  };
}

function normalizeStoredPathType(pathType: string): "bridge" | "canal" | "highway" {
  if (pathType === "canal" || pathType === "highway") {
    return pathType;
  }

  return "bridge";
}

function formatOptionalDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 16);
}

async function softDeleteMarker(
  input: { markerId: string; markerType: MarkerType },
  softDeleteInput: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date },
  dependencies: MarkerServiceDependencies
): Promise<(TowerRecord | DeedRecord | NoteRecord | RiftRecord | CampRecord | MinedoorRecord | PathRecord) | null> {
  if (input.markerType === "tower") {
    return dependencies.softDeleteTower(input.markerId, softDeleteInput);
  }

  if (input.markerType === "deed") {
    return dependencies.softDeleteDeed(input.markerId, softDeleteInput);
  }

  if (input.markerType === "rift") {
    return dependencies.softDeleteRift(input.markerId, softDeleteInput);
  }

  if (input.markerType === "camp") {
    return dependencies.softDeleteCamp(input.markerId, softDeleteInput);
  }

  if (input.markerType === "minedoor") {
    return dependencies.softDeleteMinedoor(input.markerId, softDeleteInput);
  }

  if (isPathMarkerType(input.markerType)) {
    return dependencies.softDeletePath(input.markerId, softDeleteInput);
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

  if (markerType === "rift") {
    return "RIFT";
  }

  if (markerType === "camp") {
    return "CAMP";
  }

  if (markerType === "minedoor") {
    return "MINEDOOR";
  }

  if (isPathMarkerType(markerType)) {
    return "PATH";
  }

  return "NOTE";
}

function isPathMarkerType(markerType: MarkerType): markerType is "bridge" | "canal" | "highway" {
  return markerType === "bridge" || markerType === "canal" || markerType === "highway";
}

function isPathCreateMarkerInput(input: CreateMarkerInput): input is PathCreateMarkerInput {
  return isPathMarkerType(input.type);
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
