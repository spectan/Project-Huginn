import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { canAdminister, type AccessLevel, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import { parseAuthCredentials, type AuthCredentials } from "./credentials";
import { toViewer, type AuthViewer, type ViewerUserRecord } from "./viewer";

type UserWithPassword = ViewerUserRecord & {
  passwordHash: string;
};

type SessionCreation = {
  expiresAt: Date;
  id: string;
  token: string;
};

type AuditRecordInput = {
  action:
    | "REGISTRATION"
    | "LOGIN"
    | "FAILED_LOGIN"
    | "FAILED_AUTHORIZATION"
    | "USER_APPROVED"
    | "USER_PASSWORD_CHANGED";
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: "USER" | "SESSION";
};

export type AuthServiceDependencies = {
  createSession(userId: string): Promise<SessionCreation>;
  createUser(data: { passwordHash: string; username: string }): Promise<UserWithPassword>;
  findUserById(userId: string): Promise<UserWithPassword | null>;
  findUserByUsername(username: string): Promise<UserWithPassword | null>;
  hashPassword(password: string): Promise<string>;
  recordAudit(input: AuditRecordInput): Promise<void>;
  updateUserPassword(input: {
    currentSessionTokenHash: string | null;
    passwordHash: string;
    userId: string;
  }): Promise<UserWithPassword | null>;
  updateUserApproval(input: {
    accessLevel: "READ" | "WRITE";
    approvedByUserId: string;
    userId: string;
  }): Promise<UserWithPassword | null>;
  verifyPassword(hash: string, password: string): Promise<boolean>;
};

type AuthResult = {
  sessionExpiresAt: Date;
  sessionToken: string;
  viewer: AuthViewer;
};

type OwnPasswordChangeInput = {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
};

export async function registerUser(
  input: unknown,
  dependencies: AuthServiceDependencies
): Promise<Result<AuthResult>> {
  const credentials = parseAuthCredentials(input);

  if (!credentials.ok) {
    return err(credentials.error);
  }

  const existingUser = await dependencies.findUserByUsername(credentials.value.username);

  if (existingUser !== null) {
    return err("Username is already registered");
  }

  const passwordHash = await dependencies.hashPassword(credentials.value.password);
  const user = await dependencies.createUser({
    passwordHash,
    username: credentials.value.username
  });
  const session = await dependencies.createSession(user.id);

  await recordAudit(dependencies, {
    action: "REGISTRATION",
    actorUserId: user.id,
    metadata: { username: user.username },
    targetId: user.id,
    targetType: "USER"
  });

  return ok({
    sessionExpiresAt: session.expiresAt,
    sessionToken: session.token,
    viewer: toViewer(user)
  });
}

export async function loginUser(
  input: unknown,
  dependencies: AuthServiceDependencies
): Promise<Result<AuthResult>> {
  const credentials = parseAuthCredentials(input);

  if (!credentials.ok) {
    return err(credentials.error);
  }

  const user = await dependencies.findUserByUsername(credentials.value.username);

  if (user === null || !(await passwordMatches(credentials.value, user, dependencies))) {
    await recordAudit(dependencies, {
      action: "FAILED_LOGIN",
      actorUserId: null,
      metadata: { username: credentials.value.username },
      targetId: null,
      targetType: "SESSION"
    });
    return err("Invalid username or password");
  }

  const session = await dependencies.createSession(user.id);

  await recordAudit(dependencies, {
    action: "LOGIN",
    actorUserId: user.id,
    metadata: { username: user.username },
    targetId: session.id,
    targetType: "SESSION"
  });

  return ok({
    sessionExpiresAt: session.expiresAt,
    sessionToken: session.token,
    viewer: toViewer(user)
  });
}

export async function approveUser(
  input: {
    accessLevel: AccessLevel;
    actor: UserAccess & { id: string };
    userId: string;
  },
  dependencies: AuthServiceDependencies
): Promise<Result<AuthViewer>> {
  if (!canAdminister(input.actor)) {
    await recordAudit(dependencies, {
      action: "FAILED_AUTHORIZATION",
      actorUserId: input.actor.id,
      metadata: { attemptedAction: "USER_APPROVED" },
      targetId: input.userId,
      targetType: "USER"
    });
    return err("Admin access is required");
  }

  if (input.accessLevel !== "READ" && input.accessLevel !== "WRITE") {
    return err("Approved users must receive read or write access");
  }

  const user = await dependencies.updateUserApproval({
    accessLevel: input.accessLevel,
    approvedByUserId: input.actor.id,
    userId: input.userId
  });

  if (user === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "USER_APPROVED",
    actorUserId: input.actor.id,
    metadata: {
      accessLevel: input.accessLevel,
      username: user.username
    },
    targetId: user.id,
    targetType: "USER"
  });

  return ok(toViewer(user));
}

export async function changeOwnPassword(
  input: {
    actor: { id: string };
    currentSessionTokenHash: string | null;
    input: unknown;
  },
  dependencies: AuthServiceDependencies
): Promise<Result<{ ok: true }>> {
  const passwordInput = parseOwnPasswordChangeInput(input.input);

  if (!passwordInput.ok) {
    return passwordInput;
  }

  const user = await dependencies.findUserById(input.actor.id);

  if (user === null) {
    return err("User was not found");
  }

  if (!(await dependencies.verifyPassword(user.passwordHash, passwordInput.value.currentPassword))) {
    return err("Current password is incorrect");
  }

  const passwordHash = await dependencies.hashPassword(passwordInput.value.newPassword);
  const updatedUser = await dependencies.updateUserPassword({
    currentSessionTokenHash: input.currentSessionTokenHash,
    passwordHash,
    userId: user.id
  });

  if (updatedUser === null) {
    return err("User was not found");
  }

  await recordAudit(dependencies, {
    action: "USER_PASSWORD_CHANGED",
    actorUserId: input.actor.id,
    metadata: {
      username: updatedUser.username
    },
    targetId: updatedUser.id,
    targetType: "USER"
  });

  return ok({ ok: true });
}

function parseOwnPasswordChangeInput(input: unknown): Result<OwnPasswordChangeInput> {
  if (typeof input !== "object" || input === null) {
    return err("Password change input is required");
  }

  const currentPassword = getString(input, "currentPassword");
  const newPassword = getString(input, "newPassword");
  const confirmPassword = getString(input, "confirmPassword");

  if (currentPassword.length === 0) {
    return err("Current password is required");
  }

  if (!isValidPassword(newPassword)) {
    return err("Password must be 12-128 characters");
  }

  if (newPassword !== confirmPassword) {
    return err("New passwords do not match");
  }

  return ok({
    confirmPassword,
    currentPassword,
    newPassword
  });
}

function getString(input: object, key: string): string {
  if (!(key in input)) {
    return "";
  }

  const value = input[key as keyof typeof input];
  return typeof value === "string" ? value : "";
}

function isValidPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

async function passwordMatches(
  credentials: AuthCredentials,
  user: UserWithPassword,
  dependencies: AuthServiceDependencies
): Promise<boolean> {
  return dependencies.verifyPassword(user.passwordHash, credentials.password);
}

async function recordAudit(
  dependencies: AuthServiceDependencies,
  input: AuditRecordInput
): Promise<void> {
  assertNoCoordinateMetadata(input.metadata);
  await dependencies.recordAudit(input);
}
