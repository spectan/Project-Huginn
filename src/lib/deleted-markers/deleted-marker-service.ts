import { triggerAlertDetection } from "@/lib/alerts/alert-service";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { formatTowerCreator } from "@/lib/domain/markers";
import {
  canRestoreDeletedMarkers,
  type UserAccess
} from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import type { MarkerType } from "@/lib/markers/marker-types";

const DEFAULT_DELETED_MARKER_LIMIT = 100;
const MAX_DELETED_MARKER_LIMIT = 100;

type Actor = UserAccess & {
  id: string;
};

type DeletedMarkerAuditAction =
  | "FAILED_AUTHORIZATION"
  | "MARKER_RESTORED";

type DeletedMarkerAuditTarget = "TOWER" | "DEED" | "NOTE" | "RIFT" | "CAMP" | "MINEDOOR" | "LOCATE_SOUL" | "PATH" | "SYSTEM";
type PathMarkerType = Extract<MarkerType, "bridge" | "canal" | "highway" | "tunnel">;

type DeletedMarkerAuditInput = {
  action: DeletedMarkerAuditAction;
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: DeletedMarkerAuditTarget;
};

type DeletedMarkerReference = {
  deletedAt: Date;
  deleteExpiresAt: Date;
  id: string;
  mapId: string;
};

type DeletedMarkerRecordBase = {
  deletedAt: Date;
  deletedBy: { username: string } | null;
  deleteExpiresAt: Date;
  id: string;
  map: { name: string };
  mapId: string;
  x: number;
  y: number;
};

type DeletedTowerRecord = DeletedMarkerRecordBase & {
  makerName: string;
  makerNumber: string;
};

type DeletedDeedRecord = DeletedMarkerRecordBase & {
  founder: string;
  name: string;
};

type DeletedNoteRecord = DeletedMarkerRecordBase & {
  text: string;
};

type DeletedRiftRecord = DeletedMarkerRecordBase & {
  arrivalDate: Date | null;
  estimatedRiftTime: Date | null;
};

type DeletedCampRecord = DeletedMarkerRecordBase & {
  campType: string;
};

type DeletedMinedoorRecord = DeletedMarkerRecordBase & {
  strength: string;
};

type DeletedLocateSoulRecord = DeletedMarkerRecordBase & {
  targetName: string;
};

type DeletedPathRecord = DeletedMarkerRecordBase & {
  name: string;
  pathType: PathMarkerType;
};

export type DeletedMarkerSummary = {
  deletedAt: string;
  deletedByUsername: string;
  deleteExpiresAt: string;
  id: string;
  label: string;
  mapName: string;
  type: MarkerType;
  x: number;
  y: number;
};

export type DeletedMarkerDependencies = {
  findDeletedCamp(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedDeed(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedLocateSoul(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedMinedoor(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedNote(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedPath(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedRift(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedTower(id: string): Promise<DeletedMarkerReference | null>;
  listRestorableDeletedMarkers(input: {
    limit: number;
    now: Date;
  }): Promise<{
    camps: DeletedCampRecord[];
    deeds: DeletedDeedRecord[];
    locateSouls: DeletedLocateSoulRecord[];
    minedoors: DeletedMinedoorRecord[];
    notes: DeletedNoteRecord[];
    paths: DeletedPathRecord[];
    rifts: DeletedRiftRecord[];
    towers: DeletedTowerRecord[];
  }>;
  now(): Date;
  recordAudit(input: DeletedMarkerAuditInput): Promise<void>;
  restoreCamp(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreDeed(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreLocateSoul(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreMinedoor(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreNote(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restorePath(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreRift(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreTower(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
};

export async function listRestorableDeletedMarkers(
  input: { actor: Actor; limit?: number },
  dependencies: DeletedMarkerDependencies
): Promise<Result<DeletedMarkerSummary[]>> {
  if (!canRestoreDeletedMarkers(input.actor)) {
    await auditAuthorizationFailure(
      dependencies,
      input.actor,
      "DELETED_MARKER_LIST"
    );
    return err("Admin access is required");
  }

  const deletedMarkers = await dependencies.listRestorableDeletedMarkers({
    limit: getLimit(input.limit),
    now: dependencies.now()
  });

  return ok([
    ...deletedMarkers.towers.map(serializeDeletedTower),
    ...deletedMarkers.deeds.map(serializeDeletedDeed),
    ...deletedMarkers.notes.map(serializeDeletedNote),
    ...deletedMarkers.rifts.map(serializeDeletedRift),
    ...deletedMarkers.camps.map(serializeDeletedCamp),
    ...deletedMarkers.minedoors.map(serializeDeletedMinedoor),
    ...deletedMarkers.locateSouls.map(serializeDeletedLocateSoul),
    ...deletedMarkers.paths.map(serializeDeletedPath)
  ]);
}

export async function restoreDeletedMarker(
  input: {
    actor: Actor;
    markerId: string;
    markerType: MarkerType;
  },
  dependencies: DeletedMarkerDependencies
): Promise<Result<{
  markerId: string;
  markerType: MarkerType;
}>> {
  if (!canRestoreDeletedMarkers(input.actor)) {
    await auditAuthorizationFailure(
      dependencies,
      input.actor,
      "MARKER_RESTORED"
    );
    return err("Admin access is required");
  }

  const deleted = await findDeletedMarker(input.markerType, input.markerId, dependencies);

  if (deleted === null) {
    return err("Deleted marker was not found");
  }

  if (deleted.deleteExpiresAt <= dependencies.now()) {
    return err("Restore window has expired");
  }

  const restored = await restoreMarker(input.markerType, input.markerId, {
    updatedByUserId: input.actor.id
  }, dependencies);

  if (restored === null) {
    return err("Deleted marker was not found");
  }

  await recordAudit(dependencies, {
    action: "MARKER_RESTORED",
    actorUserId: input.actor.id,
    mapId: restored.mapId,
    metadata: { markerType: input.markerType },
    targetId: restored.id,
    targetType: getAuditTargetType(input.markerType)
  });

  return ok({
    markerId: restored.id,
    markerType: input.markerType
  });
}

function getLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit)) {
    return DEFAULT_DELETED_MARKER_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_DELETED_MARKER_LIMIT);
}

function serializeDeletedTower(marker: DeletedTowerRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "tower", formatTowerCreator(marker));
}

function serializeDeletedDeed(marker: DeletedDeedRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "deed", marker.name);
}

function serializeDeletedNote(marker: DeletedNoteRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "note", marker.text.slice(0, 48));
}

function serializeDeletedRift(marker: DeletedRiftRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "rift", "Rift");
}

function serializeDeletedCamp(marker: DeletedCampRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "camp", `${marker.campType} camp`);
}

function serializeDeletedMinedoor(marker: DeletedMinedoorRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "minedoor", "Minedoor");
}

function serializeDeletedLocateSoul(marker: DeletedLocateSoulRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, "locateSoul", `Locate Soul ${marker.targetName}`);
}

function serializeDeletedPath(marker: DeletedPathRecord): DeletedMarkerSummary {
  return serializeDeletedMarker(marker, marker.pathType, marker.name || getPathTypeTitle(marker.pathType));
}

function serializeDeletedMarker(
  marker: DeletedMarkerRecordBase,
  type: MarkerType,
  label: string
): DeletedMarkerSummary {
  return {
    deletedAt: marker.deletedAt.toISOString(),
    deletedByUsername: marker.deletedBy?.username ?? "Unknown",
    deleteExpiresAt: marker.deleteExpiresAt.toISOString(),
    id: marker.id,
    label,
    mapName: marker.map.name,
    type,
    x: marker.x,
    y: marker.y
  };
}

async function findDeletedMarker(
  markerType: MarkerType,
  markerId: string,
  dependencies: DeletedMarkerDependencies
): Promise<DeletedMarkerReference | null> {
  if (markerType === "tower") {
    return dependencies.findDeletedTower(markerId);
  }

  if (markerType === "deed") {
    return dependencies.findDeletedDeed(markerId);
  }

  if (markerType === "rift") {
    return dependencies.findDeletedRift(markerId);
  }

  if (markerType === "camp") {
    return dependencies.findDeletedCamp(markerId);
  }

  if (markerType === "minedoor") {
    return dependencies.findDeletedMinedoor(markerId);
  }

  if (markerType === "locateSoul") {
    return dependencies.findDeletedLocateSoul(markerId);
  }

  if (isPathMarkerType(markerType)) {
    return dependencies.findDeletedPath(markerId);
  }

  return dependencies.findDeletedNote(markerId);
}

async function restoreMarker(
  markerType: MarkerType,
  markerId: string,
  input: { updatedByUserId: string },
  dependencies: DeletedMarkerDependencies
): Promise<{ id: string; mapId: string } | null> {
  if (markerType === "tower") {
    return dependencies.restoreTower(markerId, input);
  }

  if (markerType === "deed") {
    return dependencies.restoreDeed(markerId, input);
  }

  if (markerType === "rift") {
    return dependencies.restoreRift(markerId, input);
  }

  if (markerType === "camp") {
    return dependencies.restoreCamp(markerId, input);
  }

  if (markerType === "minedoor") {
    return dependencies.restoreMinedoor(markerId, input);
  }

  if (markerType === "locateSoul") {
    return dependencies.restoreLocateSoul(markerId, input);
  }

  if (isPathMarkerType(markerType)) {
    return dependencies.restorePath(markerId, input);
  }

  return dependencies.restoreNote(markerId, input);
}

async function auditAuthorizationFailure(
  dependencies: DeletedMarkerDependencies,
  actor: Actor,
  attemptedAction: string
): Promise<void> {
  await recordAudit(dependencies, {
    action: "FAILED_AUTHORIZATION",
    actorUserId: actor.id,
    mapId: null,
    metadata: { attemptedAction },
    targetId: null,
    targetType: "SYSTEM"
  });
  triggerAlertsSafely();
}

async function recordAudit(
  dependencies: DeletedMarkerDependencies,
  input: DeletedMarkerAuditInput
): Promise<void> {
  assertNoCoordinateMetadata(input.metadata);
  await dependencies.recordAudit(input);
}

function triggerAlertsSafely(): void {
  try {
    triggerAlertDetection();
  } catch {
    // Alert detection is fire-and-forget; failures must not block the request.
  }
}

function getAuditTargetType(markerType: MarkerType): DeletedMarkerAuditTarget {
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

function isPathMarkerType(markerType: MarkerType): markerType is PathMarkerType {
  return markerType === "bridge" || markerType === "canal" || markerType === "highway" || markerType === "tunnel";
}

function getPathTypeTitle(markerType: PathMarkerType): string {
  if (markerType === "bridge") {
    return "Bridge";
  }

  if (markerType === "canal") {
    return "Canal";
  }

  if (markerType === "highway") {
    return "Highway";
  }

  return "Tunnel";
}
