import { DELETED_MARKER_RETENTION_HOURS } from "./constants";

const HOURS_TO_MILLISECONDS = 60 * 60 * 1000;

export function getDeleteExpiresAt(deletedAt: Date): Date {
  return new Date(
    deletedAt.getTime() + DELETED_MARKER_RETENTION_HOURS * HOURS_TO_MILLISECONDS
  );
}

export function canRestoreDeletedMarker(
  now: Date,
  deleteExpiresAt: Date
): boolean {
  return now.getTime() < deleteExpiresAt.getTime();
}

export function isDeletedMarkerCleanupEligible(
  now: Date,
  deleteExpiresAt: Date
): boolean {
  return now.getTime() >= deleteExpiresAt.getTime();
}
