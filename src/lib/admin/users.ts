import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  canAdminister,
  type AccessLevel,
  type ApprovalStatus,
  type MapPermission,
  type UserAccess
} from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";

type AdminActor = UserAccess & {
  id: string;
};

type AdminUserRecord = {
  accessLevel: AccessLevel;
  approvedBy?: { username: string } | null;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
  id: string;
  isAdmin: boolean;
  mapPermissions: readonly MapPermission[];
  username: string;
};

export type AdminMapSummary = {
  id: string;
  name: string;
};

export type AdminUserSummary = {
  accessLevel: AccessLevel;
  approvedByUsername: string | null;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  id: string;
  isAdmin: boolean;
  mapPermissions: readonly MapPermission[];
  username: string;
};

export type AdminUsersList = {
  maps: AdminMapSummary[];
  users: AdminUserSummary[];
  viewerCanManageGlobalAccounts: boolean;
};

type AdminUserAuditInput = {
  action: "FAILED_AUTHORIZATION" | "PERMISSION_CHANGED" | "USER_DELETED" | "USER_PASSWORD_CHANGED";
  actorUserId: string;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: "USER" | "SYSTEM";
};

export type AdminUserDependencies = {
  hashPassword(password: string): Promise<string>;
  listMaps(): Promise<AdminMapSummary[]>;
  listUsers(): Promise<AdminUserRecord[]>;
  recordAudit(input: AdminUserAuditInput): Promise<void>;
  removeUser(input: {
    removedByUserId: string;
    userId: string;
  }): Promise<AdminUserRecord | null>;
  updateUserPassword(input: {
    passwordHash: string;
    userId: string;
  }): Promise<AdminUserRecord | null>;
  updateUserPrivileges(input: {
    approvedByUserId: string;
    isAdmin: boolean;
    mapPermissions: readonly MapPermission[];
    userId: string;
  }): Promise<AdminUserRecord | null>;
};

export async function listAdminUsers(
  input: { actor: AdminActor },
  dependencies: AdminUserDependencies
): Promise<Result<AdminUsersList>> {
  if (!canUseAdminPane(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "USER_LIST", null);
    return err("Admin access is required");
  }

  const [users, maps] = await Promise.all([
    dependencies.listUsers(),
    dependencies.listMaps()
  ]);
  const manageableMaps = getManageableMaps(input.actor, maps);
  const visibleMapIds = new Set(manageableMaps.map((map) => map.id));

  return ok({
    maps: manageableMaps,
    users: users.map((user) => serializeAdminUser(user, visibleMapIds)),
    viewerCanManageGlobalAccounts: canAdminister(input.actor)
  });
}

export async function updateAdminUser(
  input: {
    actor: AdminActor;
    isAdmin: boolean;
    mapPermissions: readonly MapPermission[];
    userId: string;
  },
  dependencies: AdminUserDependencies
): Promise<Result<AdminUserSummary>> {
  if (!canUseAdminPane(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "PERMISSION_CHANGED", input.userId);
    return err("Admin access is required");
  }

  if (input.userId === input.actor.id) {
    return err("Admins cannot change their own account");
  }

  const [users, maps] = await Promise.all([
    dependencies.listUsers(),
    dependencies.listMaps()
  ]);
  const existingUser = users.find((user) => user.id === input.userId) ?? null;

  if (existingUser === null) {
    return err("User was not found");
  }

  const globalAdmin = canAdminister(input.actor);
  const operatedMapIds = getOperatedMapIds(input.actor);

  if (!globalAdmin && existingUser.isAdmin) {
    return err("Operators cannot change global admin accounts");
  }

  if (!globalAdmin && input.isAdmin) {
    return err("Operators cannot grant global admin access");
  }

  const normalizedPermissionsResult = normalizeRequestedMapPermissions(input.mapPermissions, maps);

  if (!normalizedPermissionsResult.ok) {
    return err(normalizedPermissionsResult.error);
  }

  if (!globalAdmin && normalizedPermissionsResult.value.some((permission) => !operatedMapIds.has(permission.mapId))) {
    return err("Operators can only change permissions for their operated servers");
  }

  const nextMapPermissions = globalAdmin
    ? normalizedPermissionsResult.value
    : mergeOperatorPermissions(existingUser.mapPermissions, normalizedPermissionsResult.value, operatedMapIds);
  const user = await dependencies.updateUserPrivileges({
    approvedByUserId: input.actor.id,
    isAdmin: globalAdmin ? input.isAdmin : existingUser.isAdmin,
    mapPermissions: nextMapPermissions,
    userId: input.userId
  });

  if (user === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "PERMISSION_CHANGED",
    actorUserId: input.actor.id,
    metadata: {
      isAdmin: user.isAdmin,
      mapPermissions: user.mapPermissions,
      username: user.username
    },
    targetId: user.id,
    targetType: "USER"
  });

  return ok(serializeAdminUser(
    user,
    globalAdmin ? undefined : operatedMapIds
  ));
}

export async function updateAdminUserPassword(
  input: {
    actor: AdminActor;
    password: string;
    userId: string;
  },
  dependencies: AdminUserDependencies
): Promise<Result<AdminUserSummary>> {
  if (!canAdminister(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "USER_PASSWORD_CHANGED", input.userId);
    return err("Admin access is required");
  }

  if (!isValidPassword(input.password)) {
    return err("Password must be 12-128 characters");
  }

  const passwordHash = await dependencies.hashPassword(input.password);
  const user = await dependencies.updateUserPassword({
    passwordHash,
    userId: input.userId
  });

  if (user === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "USER_PASSWORD_CHANGED",
    actorUserId: input.actor.id,
    metadata: {
      username: user.username
    },
    targetId: user.id,
    targetType: "USER"
  });

  return ok(serializeAdminUser(user));
}

export async function removeAdminUser(
  input: {
    actor: AdminActor;
    userId: string;
  },
  dependencies: AdminUserDependencies
): Promise<Result<AdminUserSummary>> {
  if (!canAdminister(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "USER_DELETED", input.userId);
    return err("Admin access is required");
  }

  if (input.userId === input.actor.id) {
    return err("Admins cannot remove their own account");
  }

  const user = await dependencies.removeUser({
    removedByUserId: input.actor.id,
    userId: input.userId
  });

  if (user === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "USER_DELETED",
    actorUserId: input.actor.id,
    metadata: {
      username: user.username
    },
    targetId: user.id,
    targetType: "USER"
  });

  return ok(serializeAdminUser(user));
}

function serializeAdminUser(user: AdminUserRecord, visibleMapIds?: ReadonlySet<string>): AdminUserSummary {
  return {
    accessLevel: user.accessLevel,
    approvedByUsername: user.approvedBy?.username ?? null,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt.toISOString(),
    id: user.id,
    isAdmin: user.isAdmin,
    mapPermissions: sortMapPermissions(
      visibleMapIds === undefined
        ? user.mapPermissions
        : user.mapPermissions.filter((permission) => visibleMapIds.has(permission.mapId))
    ),
    username: user.username
  };
}

function isValidPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128;
}

function canUseAdminPane(actor: AdminActor): boolean {
  return canAdminister(actor) || getOperatedMapIds(actor).size > 0;
}

function getManageableMaps(actor: AdminActor, maps: AdminMapSummary[]): AdminMapSummary[] {
  if (canAdminister(actor)) {
    return maps;
  }

  const operatedMapIds = getOperatedMapIds(actor);

  return maps.filter((map) => operatedMapIds.has(map.id));
}

function getOperatedMapIds(actor: AdminActor): Set<string> {
  return new Set(
    actor.mapPermissions
      ?.filter((permission) => permission.isOperator)
      .map((permission) => permission.mapId) ?? []
  );
}

function normalizeRequestedMapPermissions(
  permissions: readonly MapPermission[],
  maps: AdminMapSummary[]
): Result<MapPermission[]> {
  const mapIds = new Set(maps.map((map) => map.id));
  const normalized = new Map<string, MapPermission>();

  for (const permission of permissions) {
    if (!mapIds.has(permission.mapId)) {
      return err("Map permission server is invalid");
    }

    if (!isAccessLevel(permission.accessLevel)) {
      return err("Access level is invalid");
    }

    if (permission.accessLevel === "NONE" && !permission.isOperator) {
      normalized.delete(permission.mapId);
      continue;
    }

    normalized.set(permission.mapId, {
      accessLevel: permission.accessLevel,
      isOperator: permission.isOperator,
      mapId: permission.mapId
    });
  }

  return ok(sortMapPermissions(Array.from(normalized.values())));
}

function mergeOperatorPermissions(
  existingPermissions: readonly MapPermission[],
  requestedPermissions: readonly MapPermission[],
  operatedMapIds: Set<string>
): MapPermission[] {
  return sortMapPermissions([
    ...existingPermissions.filter((permission) => !operatedMapIds.has(permission.mapId)),
    ...requestedPermissions
  ]);
}

function sortMapPermissions(permissions: readonly MapPermission[]): MapPermission[] {
  return Array.from(permissions).sort((a, b) => a.mapId.localeCompare(b.mapId));
}

function isAccessLevel(value: AccessLevel): boolean {
  return value === "NONE" || value === "READ" || value === "WRITE";
}

async function recordFailedAuthorization(
  dependencies: AdminUserDependencies,
  actor: AdminActor,
  attemptedAction: string,
  targetId: string | null
): Promise<void> {
  await recordAudit(dependencies, {
    action: "FAILED_AUTHORIZATION",
    actorUserId: actor.id,
    metadata: { attemptedAction },
    targetId,
    targetType: targetId === null ? "SYSTEM" : "USER"
  });
}

async function recordAudit(
  dependencies: AdminUserDependencies,
  input: AdminUserAuditInput
): Promise<void> {
  assertNoCoordinateMetadata(input.metadata);
  await dependencies.recordAudit(input);
}
