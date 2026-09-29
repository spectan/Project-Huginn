import { triggerAlertsSafely } from "@/lib/alerts/trigger-safely";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { formatTowerCreator, type PathType } from "@/lib/domain/markers";
import {
  canRestoreDeletedMarkers,
  type UserAccess
} from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import { ADMIN_ACCESS_REQUIRED, DELETED_MARKER_NOT_FOUND } from "@/lib/markers/marker-errors";
import {
  MARKER_AUDIT_TARGETS,
  getMarkerKind,
  type MarkerAuditTarget,
  type MarkerType,
  type PersistedMarkerType
} from "@/lib/markers/marker-types";

const DEFAULT_DELETED_MARKER_LIMIT = 100;
const MAX_DELETED_MARKER_LIMIT = 100;

type Actor = UserAccess & {
  id: string;
};

type DeletedMarkerAuditAction =
  | "FAILED_AUTHORIZATION"
  | "MARKER_DELETED"
  | "MARKER_RESTORED";

type DeletedMarkerAuditInput = {
  action: DeletedMarkerAuditAction;
  actorUserId: string | null;
  mapId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: MarkerAuditTarget | "SYSTEM";
};

type DeletedMarkerReference = {
  deletedAt: Date;
  deleteExpiresAt: Date;
  id: string;
  mapId: string;
};

type RestoredMarker = {
  id: string;
  mapId: string;
  x: number;
  y: number;
};

type RetiredNote = {
  id: string;
  x: number;
  y: number;
};

type RestoreInput = {
  now: Date;
  updatedByUserId: string;
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
  pathType: PathType;
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

export type DeletedMarkerStore = {
  find(id: string): Promise<DeletedMarkerReference | null>;
  // Restoring a disbanded deed also reports the disband note it retired.
  restore(id: string, input: RestoreInput): Promise<(RestoredMarker & { retiredNote?: RetiredNote | null }) | null>;
};

export type DeletedMarkerDependencies = {
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
  markers: Record<PersistedMarkerType, DeletedMarkerStore>;
  now(): Date;
  recordAudit(input: DeletedMarkerAuditInput): Promise<void>;
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
    return err(ADMIN_ACCESS_REQUIRED);
  }

  const limit = getLimit(input.limit);
  const deletedMarkers = await dependencies.listRestorableDeletedMarkers({
    limit,
    now: dependencies.now()
  });

  // Each table is capped at `limit`; merge them and apply the cap overall.
  const merged = [
    ...deletedMarkers.towers.map(serializeDeletedTower),
    ...deletedMarkers.deeds.map(serializeDeletedDeed),
    ...deletedMarkers.notes.map(serializeDeletedNote),
    ...deletedMarkers.rifts.map(serializeDeletedRift),
    ...deletedMarkers.camps.map(serializeDeletedCamp),
    ...deletedMarkers.minedoors.map(serializeDeletedMinedoor),
    ...deletedMarkers.locateSouls.map(serializeDeletedLocateSoul),
    ...deletedMarkers.paths.map(serializeDeletedPath)
  ];

  return ok(
    merged
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
      .slice(0, limit)
  );
}

export async function restoreDeletedMarker(
  input: {
    actor: Actor;
    markerId: string;
    markerType: PersistedMarkerType;
  },
  dependencies: DeletedMarkerDependencies
): Promise<Result<{
  markerId: string;
  markerType: PersistedMarkerType;
}>> {
  if (!canRestoreDeletedMarkers(input.actor)) {
    await auditAuthorizationFailure(
      dependencies,
      input.actor,
      "MARKER_RESTORED"
    );
    return err(ADMIN_ACCESS_REQUIRED);
  }

  const store = dependencies.markers[input.markerType];
  const deleted = await store.find(input.markerId);

  if (deleted === null) {
    return err(DELETED_MARKER_NOT_FOUND);
  }

  const now = dependencies.now();

  if (deleted.deleteExpiresAt <= now) {
    return err("Restore window has expired");
  }

  const restored = await store.restore(input.markerId, {
    now,
    updatedByUserId: input.actor.id
  });

  if (restored === null) {
    return err(DELETED_MARKER_NOT_FOUND);
  }

  await recordAudit(dependencies, {
    action: "MARKER_RESTORED",
    actorUserId: input.actor.id,
    mapId: restored.mapId,
    metadata: { markerType: input.markerType, x: restored.x, y: restored.y },
    targetId: restored.id,
    targetType: MARKER_AUDIT_TARGETS[getMarkerKind(input.markerType)]
  });

  // Restoring a disbanded deed retires the "Abandoned Deed" note created for it.
  if (restored.retiredNote !== undefined && restored.retiredNote !== null) {
    await recordAudit(dependencies, {
      action: "MARKER_DELETED",
      actorUserId: input.actor.id,
      mapId: restored.mapId,
      metadata: {
        markerType: "note",
        reason: "deed_restored",
        x: restored.retiredNote.x,
        y: restored.retiredNote.y
      },
      targetId: restored.retiredNote.id,
      targetType: "NOTE"
    });
  }

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
  return serializeDeletedMarker(marker, marker.pathType, marker.name || capitalize(marker.pathType));
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
