import { triggerAlertDetection } from "@/lib/alerts/alert-service";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { canViewAuditLog, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";

const DEFAULT_AUDIT_HISTORY_LIMIT = 100;
const MAX_AUDIT_HISTORY_LIMIT = 100;
const CURSOR_SEPARATOR = "|";
const REDACTED_METADATA_KEYS = new Set([
  "coordinate",
  "coordinates",
  "hash",
  "password",
  "position",
  "secret",
  "sessiontoken",
  "token"
]);

type Actor = UserAccess & {
  id: string;
};

export type AuditHistoryAction =
  | "REGISTRATION"
  | "LOGIN"
  | "LOGOUT"
  | "FAILED_LOGIN"
  | "FAILED_AUTHORIZATION"
  | "USER_APPROVED"
  | "USER_DELETED"
  | "USER_PASSWORD_CHANGED"
  | "PERMISSION_CHANGED"
  | "MAP_UPDATED"
  | "MARKER_CREATED"
  | "MARKER_UPDATED"
  | "MARKER_DELETED"
  | "MARKER_RESTORED"
  | "MARKER_CLEANED_UP"
  | "MAP_DATA_ACCESSED"
  | "SHARE_LINK_CREATED";

export type AuditHistoryActionGroup = "add" | "edit" | "delete" | "other";

export type AuditHistoryOrder = "asc" | "desc";

export type AuditHistoryTargetType =
  | "USER"
  | "MAP"
  | "TOWER"
  | "DEED"
  | "NOTE"
  | "RIFT"
  | "CAMP"
  | "MINEDOOR"
  | "LOCATE_SOUL"
  | "PATH"
  | "SESSION"
  | "SYSTEM";

type AuditHistoryRecord = {
  action: AuditHistoryAction;
  actor: { username: string } | null;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
  map: { name: string } | null;
  mapId: string | null;
  metadata: unknown;
  targetId: string | null;
  targetType: AuditHistoryTargetType;
};

type FailedAuthorizationAuditInput = {
  action: "FAILED_AUTHORIZATION";
  actorUserId: string;
  mapId: null;
  metadata: Record<string, unknown>;
  targetId: null;
  targetType: "SYSTEM";
};

export type AuditHistoryDependencies = {
  listEvents(input: {
    actionGroup?: AuditHistoryActionGroup;
    actorUserId?: string;
    before: { createdAt: Date; id: string } | null;
    limit: number;
    mapId?: string;
    order?: AuditHistoryOrder;
  }): Promise<AuditHistoryRecord[]>;
  listMaps(): Promise<{ id: string; name: string }[]>;
  listUsers(): Promise<{ id: string; username: string }[]>;
  recordAudit(input: FailedAuthorizationAuditInput): Promise<void>;
};

export type AuditHistoryEvent = {
  action: AuditHistoryAction;
  actorUsername: string;
  createdAt: string;
  id: string;
  mapId: string | null;
  mapName: string;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: AuditHistoryTargetType;
  x: number | null;
  y: number | null;
};

export type AuditHistoryFilters = {
  actionGroup?: AuditHistoryActionGroup;
  actorUserId?: string;
  mapId?: string;
  order?: AuditHistoryOrder;
};

export async function listAuditHistory(
  input: { actor: Actor; before?: string; limit?: number } & AuditHistoryFilters,
  dependencies: AuditHistoryDependencies
): Promise<Result<{
  events: AuditHistoryEvent[];
  nextCursor: string | null;
}>> {
  if (!canViewAuditLog(input.actor)) {
    await recordFailedAuthorization(input.actor, dependencies);
    return err("Admin access is required");
  }

  const limit = getAuditHistoryLimit(input.limit);
  const cursor = parseCursor(input.before);

  if (!cursor.ok) {
    return cursor;
  }

  const records = await dependencies.listEvents({
    actionGroup: input.actionGroup,
    actorUserId: input.actorUserId,
    before: cursor.value,
    limit: limit + 1,
    mapId: input.mapId,
    order: input.order
  });
  const pageRecords = records.slice(0, limit);
  const lastRecord = pageRecords[pageRecords.length - 1] ?? null;
  const nextCursor = records.length > limit && lastRecord !== null
    ? encodeCursor(lastRecord)
    : null;

  return ok({
    events: pageRecords.map(serializeAuditEvent),
    nextCursor
  });
}

export async function listAuditHistoryFilterOptions(
  input: { actor: Actor },
  dependencies: AuditHistoryDependencies
): Promise<Result<{
  maps: { id: string; name: string }[];
  users: { id: string; username: string }[];
}>> {
  if (!canViewAuditLog(input.actor)) {
    return err("Admin access is required");
  }

  const [maps, users] = await Promise.all([
    dependencies.listMaps(),
    dependencies.listUsers()
  ]);

  return ok({ maps, users });
}

function getAuditHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit)) {
    return DEFAULT_AUDIT_HISTORY_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_AUDIT_HISTORY_LIMIT);
}

function parseCursor(
  cursor: string | undefined
): Result<{ createdAt: Date; id: string } | null> {
  if (cursor === undefined || cursor.length === 0) {
    return ok(null);
  }

  const separatorIndex = cursor.lastIndexOf(CURSOR_SEPARATOR);

  if (separatorIndex === -1) {
    return err("History cursor is invalid");
  }

  const createdAt = new Date(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + CURSOR_SEPARATOR.length);

  if (Number.isNaN(createdAt.getTime()) || id.length === 0) {
    return err("History cursor is invalid");
  }

  return ok({ createdAt, id });
}

function encodeCursor(record: AuditHistoryRecord): string {
  return `${record.createdAt.toISOString()}${CURSOR_SEPARATOR}${record.id}`;
}

function serializeAuditEvent(record: AuditHistoryRecord): AuditHistoryEvent {
  const metadata = sanitizeMetadata(record.metadata);
  return {
    action: record.action,
    actorUsername: record.actor?.username ?? "System",
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    mapId: record.mapId,
    mapName: record.map?.name ?? "",
    metadata,
    targetId: record.targetId,
    targetType: record.targetType,
    x: extractCoordinate(metadata, "x"),
    y: extractCoordinate(metadata, "y")
  };
}

function extractCoordinate(metadata: Record<string, unknown>, key: "x" | "y"): number | null {
  const value = metadata[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

async function recordFailedAuthorization(
  actor: Actor,
  dependencies: AuditHistoryDependencies
): Promise<void> {
  const metadata = { attemptedAction: "AUDIT_LOG_VIEW" };
  assertNoCoordinateMetadata(metadata);
  await dependencies.recordAudit({
    action: "FAILED_AUTHORIZATION",
    actorUserId: actor.id,
    mapId: null,
    metadata,
    targetId: null,
    targetType: "SYSTEM"
  });
  triggerAlertsSafely();
}

function triggerAlertsSafely(): void {
  try {
    triggerAlertDetection();
  } catch {
    // Alert detection is fire-and-forget; failures must not block the request.
  }
}

function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!isPlainObject(metadata)) {
    return {};
  }

  return sanitizeObject(metadata);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (isPlainObject(value)) {
    return sanitizeObject(value);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !REDACTED_METADATA_KEYS.has(key.toLowerCase()))
      .map(([key, childValue]) => [key, sanitizeValue(childValue)])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
