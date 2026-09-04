import { triggerAlertDetection } from "@/lib/alerts/alert-service";
import { getOrCreateCanaries, type CanaryDependencies } from "@/lib/canaries/canary-service";
import { createDiscordDependencies } from "@/lib/discord/database";
import {
  dispatchDiscordNotification,
  type DiscordNotificationMessage
} from "@/lib/discord/discord-service";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
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
  type CampMarkerInput,
  type DeedMarkerInput,
  type LocateSoulMarkerInput,
  type MinedoorMarkerInput,
  type NoteMarkerInput,
  type PathMarkerInput,
  type PathType,
  type RiftMarkerInput,
  type TowerMarkerInput,
  type TowerType
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
  LocateSoulWorkspaceMarker,
  MarkerType,
  MinedoorWorkspaceMarker,
  NoteCategory,
  NoteWorkspaceMarker,
  PathWorkspaceMarker,
  RiftWorkspaceMarker,
  TowerWorkspaceMarker,
  WorkspaceMap,
  WorkspaceMarker
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

type UserSummaryRecord = {
  username: string;
};

type MarkerModifierRecord = {
  createdBy?: UserSummaryRecord | null;
  updatedBy?: UserSummaryRecord | null;
};

type TowerRecord = Omit<TowerMarkerInput, "towerType"> & {
  id: string;
  mapId: string;
  towerType: string;
} & MarkerModifierRecord;

type DeedRecord = DeedMarkerInput & {
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type NoteRecord = NoteMarkerInput & {
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type NoteCategoryRecord = {
  color: string | null;
  id: string;
  markerShape: string;
  mapId: string;
  name: string;
  pipSize: number;
};

type RiftRecord = RiftMarkerInput & {
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type CampRecord = Omit<CampMarkerInput, "campType"> & {
  campType: string;
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type MinedoorRecord = MinedoorMarkerInput & {
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type LocateSoulRecord = Omit<LocateSoulMarkerInput, "casterFacing" | "direction" | "distanceBand"> & {
  casterFacing: string;
  direction: string;
  distanceBand: string;
  id: string;
  mapId: string;
} & MarkerModifierRecord;

type PathRecord = Omit<PathMarkerInput, "pathType"> & {
  id: string;
  mapId: string;
  pathType: string;
} & MarkerModifierRecord;

type MarkerWithMap<T> = T & {
  map: MapRecord;
};

type MarkerAuditAction =
  | "FAILED_AUTHORIZATION"
  | "MARKER_CREATED"
  | "MARKER_UPDATED"
  | "MARKER_DELETED";

type MarkerAuditTarget = "TOWER" | "DEED" | "NOTE" | "RIFT" | "CAMP" | "MINEDOOR" | "LOCATE_SOUL" | "PATH" | "MAP";

type MarkerAuditInput = {
  action: MarkerAuditAction;
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: MarkerAuditTarget;
};

export type MarkerServiceDependencies = CanaryDependencies & {
  createCamp(input: CampMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<CampRecord>;
  createDeed(input: DeedMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<DeedRecord>;
  createLocateSoul(input: LocateSoulMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<LocateSoulRecord>;
  createMinedoor(input: MinedoorMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<MinedoorRecord>;
  createNote(input: NoteMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<NoteRecord>;
  createPath(input: PathMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<PathRecord>;
  createRift(input: RiftMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<RiftRecord>;
  createTower(input: TowerMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string }): Promise<TowerRecord>;
  disbandDeed(input: {
    actorUserId: string;
    categoryName: string;
    deedId: string;
    deletedAt: Date;
    deleteExpiresAt: Date;
    note: NoteMarkerInput & { createdByUserId: string; mapId: string; updatedByUserId: string };
  }): Promise<{
    category: NoteCategoryRecord;
    deletedDeed: DeedRecord;
    note: NoteRecord;
  } | null>;
  findCamp(id: string): Promise<MarkerWithMap<CampRecord> | null>;
  findDeed(id: string): Promise<MarkerWithMap<DeedRecord> | null>;
  findLocateSoul(id: string): Promise<MarkerWithMap<LocateSoulRecord> | null>;
  findMap(mapId: string): Promise<MapRecord | null>;
  findMinedoor(id: string): Promise<MarkerWithMap<MinedoorRecord> | null>;
  findNote(id: string): Promise<MarkerWithMap<NoteRecord> | null>;
  findPath(id: string): Promise<MarkerWithMap<PathRecord> | null>;
  findRift(id: string): Promise<MarkerWithMap<RiftRecord> | null>;
  findTower(id: string): Promise<MarkerWithMap<TowerRecord> | null>;
  listActiveMarkers(mapId: string): Promise<{
    camps: CampRecord[];
    deeds: DeedRecord[];
    locateSouls: LocateSoulRecord[];
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
  softDeleteLocateSoul(
    id: string,
    input: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date }
  ): Promise<LocateSoulRecord | null>;
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
  updateLocateSoul(id: string, input: LocateSoulMarkerInput & { updatedByUserId: string }): Promise<LocateSoulRecord | null>;
  updateMinedoor(id: string, input: MinedoorMarkerInput & { updatedByUserId: string }): Promise<MinedoorRecord | null>;
  updateNote(id: string, input: NoteMarkerInput & { updatedByUserId: string }): Promise<NoteRecord | null>;
  updatePath(id: string, input: PathMarkerInput & { updatedByUserId: string }): Promise<PathRecord | null>;
  updateRift(id: string, input: RiftMarkerInput & { updatedByUserId: string }): Promise<RiftRecord | null>;
  updateTower(id: string, input: TowerMarkerInput & { updatedByUserId: string }): Promise<TowerRecord | null>;
};

const ABANDONED_DEED_CATEGORY_NAME = "Abandoned Deed";

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
      planned?: boolean;
      ql: string;
      towerType?: string;
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
  | ({ type: "locateSoul" } & {
      casterFacing: string;
      direction: string;
      distanceBand: string;
      notes: string;
      targetName: string;
      x: number;
      y: number;
    })
  | PathCreateMarkerInput;

export async function listMarkers(
  input: { actor: Actor; includeCanaries?: boolean; mapId: string },
  dependencies: MarkerServiceDependencies
): Promise<Result<{ map: WorkspaceMap; markers: WorkspaceMarker[] }>> {
  if (!canReadMap(input.actor, input.mapId)) {
    await auditAuthorizationFailure(dependencies, input.actor, input.mapId);
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const markers = await dependencies.listActiveMarkers(map.id);
  const serialized: WorkspaceMarker[] = [
    ...markers.towers.map(serializeTower),
    ...markers.deeds.map(serializeDeed),
    ...markers.notes.map(serializeNote),
    ...markers.rifts.map(serializeRift),
    ...markers.camps.map(serializeCamp),
    ...markers.minedoors.map(serializeMinedoor),
    ...markers.locateSouls.map(serializeLocateSoul),
    ...markers.paths.map(serializePath)
  ];

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
  if (!canWriteMarkers(input.actor, input.mapId)) {
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeTower(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeDeed(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeRift(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeCamp(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeMinedoor(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
    return ok(marker);
  }

  if (markerInput.value.type === "locateSoul") {
    const locateSoul = validateLocateSoulInput(markerInput.value, bounds);

    if (!locateSoul.ok) {
      return locateSoul;
    }

    const created = await dependencies.createLocateSoul({
      ...locateSoul.value,
      createdByUserId: input.actor.id,
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializeLocateSoul(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
      mapId: map.id,
      updatedByUserId: input.actor.id
    });
    const marker = serializePath(created);
    await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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
    mapId: map.id,
    updatedByUserId: input.actor.id
  });
  const marker = serializeNote(created);
  await auditMarkerWrite(dependencies, "MARKER_CREATED", input.actor, map.id, map.name, marker);
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

  if (input.markerType === "tower") {
    const existing = await dependencies.findTower(input.markerId);

    if (existing === null || markerInput.value.type !== "tower") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (input.markerType === "deed") {
    const existing = await dependencies.findDeed(input.markerId);

    if (existing === null || markerInput.value.type !== "deed") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (input.markerType === "rift") {
    const existing = await dependencies.findRift(input.markerId);

    if (existing === null || markerInput.value.type !== "rift") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (input.markerType === "camp") {
    const existing = await dependencies.findCamp(input.markerId);

    if (existing === null || markerInput.value.type !== "camp") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (input.markerType === "minedoor") {
    const existing = await dependencies.findMinedoor(input.markerId);

    if (existing === null || markerInput.value.type !== "minedoor") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (input.markerType === "locateSoul") {
    const existing = await dependencies.findLocateSoul(input.markerId);

    if (existing === null || markerInput.value.type !== "locateSoul") {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
    }

    const validated = validateLocateSoulInput(markerInput.value, existing.map);
    if (!validated.ok) {
      return validated;
    }

    const updated = await dependencies.updateLocateSoul(input.markerId, {
      ...validated.value,
      updatedByUserId: input.actor.id
    });

    if (updated === null) {
      return err("Marker was not found");
    }

    const marker = serializeLocateSoul(updated);
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  if (isPathMarkerType(input.markerType)) {
    const existing = await dependencies.findPath(input.markerId);

    if (existing === null || !isPathCreateMarkerInput(markerInput.value) || existing.pathType !== input.markerType) {
      return err("Marker was not found");
    }
    if (!canWriteMarkers(input.actor, existing.mapId)) {
      await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
      return err("Write access is required");
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
    await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
    return ok(marker);
  }

  const existing = await dependencies.findNote(input.markerId);

  if (existing === null || markerInput.value.type !== "note") {
    return err("Marker was not found");
  }
  if (!canWriteMarkers(input.actor, existing.mapId)) {
    await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
    return err("Write access is required");
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
  await auditMarkerWrite(dependencies, "MARKER_UPDATED", input.actor, existing.mapId, existing.map.name, marker);
  return ok(marker);
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
  const existing = await dependencies.findDeed(input.markerId);

  if (existing === null) {
    return err("Marker was not found");
  }
  if (!canWriteMarkers(input.actor, existing.mapId)) {
    await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
    return err("Write access is required");
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
    return err("Marker was not found");
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
    category: {
      ...serializeNoteCategory(conversion.category)
    },
    deletedMarkerId: conversion.deletedDeed.id,
    marker
  });
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
      planned: getBoolean(input, "planned"),
      ql: getString(input, "ql"),
      towerType: getString(input, "towerType"),
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

  if (input.type === "locateSoul") {
    return ok({
      casterFacing: getString(input, "casterFacing"),
      direction: getString(input, "direction"),
      distanceBand: getString(input, "distanceBand"),
      notes: getString(input, "notes"),
      targetName: getString(input, "targetName"),
      type: "locateSoul",
      x: getNumber(input, "x"),
      y: getNumber(input, "y")
    });
  }

  if (input.type === "bridge" || input.type === "canal" || input.type === "highway" || input.type === "tunnel") {
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

function getBoolean(input: object, key: string): boolean {
  if (!(key in input)) {
    return false;
  }

  const value = input[key as keyof typeof input];
  return value === true;
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
  const existing = await findExistingMarkerForDelete(input, dependencies);

  if (existing === null) {
    return err("Marker was not found");
  }

  if (!canWriteMarkers(input.actor, existing.mapId)) {
    await auditAuthorizationFailure(dependencies, input.actor, existing.mapId);
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
    metadata: {
      markerType: input.markerType,
      x: "x" in deleted ? deleted.x : undefined,
      y: "y" in deleted ? deleted.y : undefined
    },
    targetId: deleted.id,
    targetType: getAuditTargetType(input.markerType)
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
    markerShape: category.markerShape === "x" ||
      category.markerShape === "o" ||
      category.markerShape === "triangle" ||
      category.markerShape === "square"
      ? category.markerShape
      : "circle",
    name: category.name,
    pipSize: Math.min(10, Math.max(1, Math.round(category.pipSize)))
  };
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
  if (pathType === "canal" || pathType === "highway" || pathType === "tunnel") {
    return pathType;
  }

  return "bridge";
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

async function softDeleteMarker(
  input: { markerId: string; markerType: MarkerType },
  softDeleteInput: { deletedAt: Date; deletedByUserId: string; deleteExpiresAt: Date },
  dependencies: MarkerServiceDependencies
): Promise<(TowerRecord | DeedRecord | NoteRecord | RiftRecord | CampRecord | MinedoorRecord | LocateSoulRecord | PathRecord) | null> {
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

  if (input.markerType === "locateSoul") {
    return dependencies.softDeleteLocateSoul(input.markerId, softDeleteInput);
  }

  if (isPathMarkerType(input.markerType)) {
    return dependencies.softDeletePath(input.markerId, softDeleteInput);
  }

  return dependencies.softDeleteNote(input.markerId, softDeleteInput);
}

async function findExistingMarkerForDelete(
  input: { markerId: string; markerType: MarkerType },
  dependencies: MarkerServiceDependencies
): Promise<{ mapId: string; map: MapRecord } | null> {
  if (input.markerType === "tower") {
    return dependencies.findTower(input.markerId);
  }

  if (input.markerType === "deed") {
    return dependencies.findDeed(input.markerId);
  }

  if (input.markerType === "rift") {
    return dependencies.findRift(input.markerId);
  }

  if (input.markerType === "camp") {
    return dependencies.findCamp(input.markerId);
  }

  if (input.markerType === "minedoor") {
    return dependencies.findMinedoor(input.markerId);
  }

  if (input.markerType === "locateSoul") {
    return dependencies.findLocateSoul(input.markerId);
  }

  if (isPathMarkerType(input.markerType)) {
    return dependencies.findPath(input.markerId);
  }

  return dependencies.findNote(input.markerId);
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
  triggerAlertsSafely();
}

async function auditMarkerWrite(
  dependencies: MarkerServiceDependencies,
  action: "MARKER_CREATED" | "MARKER_UPDATED",
  actor: Actor,
  mapId: string,
  mapName: string,
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
        marker.type === "tower" ? TOWER_PROTECTION_DISTANCE_TILES : undefined,
      x: marker.x,
      y: marker.y
    },
    targetId: marker.id,
    targetType: getAuditTargetType(marker.type)
  });
  dispatchDiscordSafely({
    kind: "marker",
    action: action === "MARKER_CREATED" ? "created" : "updated",
    username: actor.username,
    mapName,
    markerType: marker.type
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

  if (markerType === "locateSoul") {
    return "LOCATE_SOUL";
  }

  if (isPathMarkerType(markerType)) {
    return "PATH";
  }

  return "NOTE";
}

function isPathMarkerType(markerType: MarkerType): markerType is PathType {
  return markerType === "bridge" || markerType === "canal" || markerType === "highway" || markerType === "tunnel";
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

function triggerAlertsSafely(): void {
  try {
    triggerAlertDetection();
  } catch {
    // Alert detection is fire-and-forget; failures must not block the request.
  }
}

function dispatchDiscordSafely(message: DiscordNotificationMessage): void {
  try {
    dispatchDiscordNotification(message, createDiscordDependencies()).catch(() => undefined);
  } catch {
    // Discord notifications are fire-and-forget; failures must not block the request.
  }
}

function removeUndefined(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
}
