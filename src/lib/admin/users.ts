import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  canAdminister,
  type AccessLevel,
  type ApprovalStatus,
  type UserAccess
} from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";

type AdminActor = UserAccess & {
  id: string;
};

type AdminUserRecord = {
  accessLevel: AccessLevel;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
  id: string;
  isAdmin: boolean;
  username: string;
};

export type AdminUserSummary = {
  accessLevel: AccessLevel;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  id: string;
  isAdmin: boolean;
  username: string;
};

type AdminUserAuditInput = {
  action: "FAILED_AUTHORIZATION" | "PERMISSION_CHANGED" | "USER_REJECTED";
  actorUserId: string;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: "USER" | "SYSTEM";
};

export type AdminUserDependencies = {
  listUsers(): Promise<AdminUserRecord[]>;
  recordAudit(input: AdminUserAuditInput): Promise<void>;
  removeUser(input: {
    removedByUserId: string;
    userId: string;
  }): Promise<AdminUserRecord | null>;
  updateUserPrivileges(input: {
    accessLevel: AccessLevel;
    approvedByUserId: string;
    isAdmin: boolean;
    userId: string;
  }): Promise<AdminUserRecord | null>;
};

export async function listAdminUsers(
  input: { actor: AdminActor },
  dependencies: AdminUserDependencies
): Promise<Result<{ users: AdminUserSummary[] }>> {
  if (!canAdminister(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "USER_LIST", null);
    return err("Admin access is required");
  }

  const users = await dependencies.listUsers();

  return ok({
    users: users.map(serializeAdminUser)
  });
}

export async function updateAdminUser(
  input: {
    accessLevel: AccessLevel;
    actor: AdminActor;
    isAdmin: boolean;
    userId: string;
  },
  dependencies: AdminUserDependencies
): Promise<Result<AdminUserSummary>> {
  if (!canAdminister(input.actor)) {
    await recordFailedAuthorization(dependencies, input.actor, "PERMISSION_CHANGED", input.userId);
    return err("Admin access is required");
  }

  if (input.userId === input.actor.id) {
    return err("Admins cannot change their own account");
  }

  if (!isAccessLevel(input.accessLevel)) {
    return err("Access level is invalid");
  }

  const user = await dependencies.updateUserPrivileges({
    accessLevel: input.accessLevel,
    approvedByUserId: input.actor.id,
    isAdmin: input.isAdmin,
    userId: input.userId
  });

  if (user === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "PERMISSION_CHANGED",
    actorUserId: input.actor.id,
    metadata: {
      accessLevel: user.accessLevel,
      isAdmin: user.isAdmin,
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
    await recordFailedAuthorization(dependencies, input.actor, "USER_REJECTED", input.userId);
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
    action: "USER_REJECTED",
    actorUserId: input.actor.id,
    metadata: {
      username: user.username
    },
    targetId: user.id,
    targetType: "USER"
  });

  return ok(serializeAdminUser(user));
}

function serializeAdminUser(user: AdminUserRecord): AdminUserSummary {
  return {
    accessLevel: user.accessLevel,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt.toISOString(),
    id: user.id,
    isAdmin: user.isAdmin,
    username: user.username
  };
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
