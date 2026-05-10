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
const CLEANUP_BATCH_LIMIT = 100;

type Actor = UserAccess & {
  id: string;
};

type DeletedMarkerAuditAction =
  | "FAILED_AUTHORIZATION"
  | "MARKER_CLEANED_UP"
  | "MARKER_RESTORED";

type DeletedMarkerAuditTarget = "TOWER" | "DEED" | "NOTE" | "SYSTEM";

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

type ExpiredDeletedMarkerReference = {
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
  findDeletedDeed(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedNote(id: string): Promise<DeletedMarkerReference | null>;
  findDeletedTower(id: string): Promise<DeletedMarkerReference | null>;
  listExpiredDeletedMarkers(input: {
    limit: number;
    now: Date;
  }): Promise<{
    deeds: ExpiredDeletedMarkerReference[];
    notes: ExpiredDeletedMarkerReference[];
    towers: ExpiredDeletedMarkerReference[];
  }>;
  listRestorableDeletedMarkers(input: {
    limit: number;
    now: Date;
  }): Promise<{
    deeds: DeletedDeedRecord[];
    notes: DeletedNoteRecord[];
    towers: DeletedTowerRecord[];
  }>;
  now(): Date;
  permanentlyDeleteDeeds(ids: string[]): Promise<number>;
  permanentlyDeleteNotes(ids: string[]): Promise<number>;
  permanentlyDeleteTowers(ids: string[]): Promise<number>;
  recordAudit(input: DeletedMarkerAuditInput): Promise<void>;
  restoreDeed(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
  restoreNote(id: string, input: { updatedByUserId: string }): Promise<{ id: string; mapId: string } | null>;
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
    ...deletedMarkers.notes.map(serializeDeletedNote)
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

export async function cleanupExpiredDeletedMarkers(
  dependencies: DeletedMarkerDependencies
): Promise<{
  deletedCounts: Record<MarkerType, number>;
}> {
  const now = dependencies.now();
  const expired = await dependencies.listExpiredDeletedMarkers({
    limit: CLEANUP_BATCH_LIMIT,
    now
  });
  const towerCount = await deleteAndAuditExpiredMarkers(
    "tower",
    expired.towers,
    now,
    dependencies.permanentlyDeleteTowers,
    dependencies
  );
  const deedCount = await deleteAndAuditExpiredMarkers(
    "deed",
    expired.deeds,
    now,
    dependencies.permanentlyDeleteDeeds,
    dependencies
  );
  const noteCount = await deleteAndAuditExpiredMarkers(
    "note",
    expired.notes,
    now,
    dependencies.permanentlyDeleteNotes,
    dependencies
  );

  return {
    deletedCounts: {
      deed: deedCount,
      note: noteCount,
      tower: towerCount
    }
  };
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

  return dependencies.restoreNote(markerId, input);
}

async function deleteAndAuditExpiredMarkers(
  markerType: MarkerType,
  markers: ExpiredDeletedMarkerReference[],
  now: Date,
  deleteMarkers: (ids: string[]) => Promise<number>,
  dependencies: DeletedMarkerDependencies
): Promise<number> {
  if (markers.length === 0) {
    return 0;
  }

  const deletedCount = await deleteMarkers(markers.map((marker) => marker.id));

  for (const marker of markers.slice(0, deletedCount)) {
    await recordAudit(dependencies, {
      action: "MARKER_CLEANED_UP",
      actorUserId: null,
      mapId: marker.mapId,
      metadata: {
        cleanedAt: now.toISOString(),
        markerType
      },
      targetId: marker.id,
      targetType: getAuditTargetType(markerType)
    });
  }

  return deletedCount;
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
}

async function recordAudit(
  dependencies: DeletedMarkerDependencies,
  input: DeletedMarkerAuditInput
): Promise<void> {
  assertNoCoordinateMetadata(input.metadata);
  await dependencies.recordAudit(input);
}

function getAuditTargetType(markerType: MarkerType): DeletedMarkerAuditTarget {
  if (markerType === "tower") {
    return "TOWER";
  }

  if (markerType === "deed") {
    return "DEED";
  }

  return "NOTE";
}
