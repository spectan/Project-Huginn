import { triggerAlertsSafely } from "@/lib/alerts/trigger-safely";
import { dispatchDiscordSafely } from "@/lib/discord/dispatch-safely";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { err, ok, type Result } from "@/lib/domain/result";
import { parseAuthCredentials } from "./credentials";
import type { FailureRateLimiter } from "./failure-rate-limiter";
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
    | "USER_PASSWORD_CHANGED";
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  targetId: string | null;
  targetType: "USER" | "SESSION";
};

const USERNAME_TAKEN_MESSAGE = "Username is already registered";
export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many failed attempts. Try again later.";

// A real argon2id hash of a random throwaway password, verified when the
// username does not exist so that response timing does not reveal usernames.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$fmjJ5LvBxuywXqI2BOd1KQ$nzPyzzuICTlMIgRS3yNizKg0OPj7kEljA7KUvKGSmRk";

export type AuthServiceDependencies = {
  createSession(userId: string): Promise<SessionCreation>;
  /** Returns null when the username (case-insensitively) is already taken. */
  createUser(data: { passwordHash: string; username: string }): Promise<UserWithPassword | null>;
  /** Counts login attempts per client IP and password changes per user. */
  failureRateLimiter: FailureRateLimiter;
  findUserById(userId: string): Promise<UserWithPassword | null>;
  findUserByUsername(username: string): Promise<UserWithPassword | null>;
  hashPassword(password: string): Promise<string>;
  recordAudit(input: AuditRecordInput): Promise<void>;
  /** Counts every registration attempt per client IP. */
  registrationRateLimiter: FailureRateLimiter;
  updateUserPassword(input: {
    currentSessionTokenHash: string | null;
    passwordHash: string;
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
  dependencies: AuthServiceDependencies,
  context: { clientIp?: string } = {}
): Promise<Result<AuthResult>> {
  // Without a trusted client IP there is nothing safe to key on, so the
  // limiter is skipped rather than throttling every visitor together.
  if (hasClientIp(context.clientIp) &&
    !dependencies.registrationRateLimiter.tryAcquire(`register-ip:${context.clientIp}`)) {
    return err(TOO_MANY_ATTEMPTS_MESSAGE);
  }

  const credentials = parseAuthCredentials(input);

  if (!credentials.ok) {
    return err(credentials.error);
  }

  const existingUser = await dependencies.findUserByUsername(credentials.value.username);

  if (existingUser !== null) {
    return err(USERNAME_TAKEN_MESSAGE);
  }

  const passwordHash = await dependencies.hashPassword(credentials.value.password);
  const user = await dependencies.createUser({
    passwordHash,
    username: credentials.value.username
  });

  if (user === null) {
    return err(USERNAME_TAKEN_MESSAGE);
  }
  const session = await dependencies.createSession(user.id);

  await recordAudit(dependencies, {
    action: "REGISTRATION",
    actorUserId: user.id,
    metadata: { username: user.username },
    targetId: user.id,
    targetType: "USER"
  });
  triggerAlertsSafely();
  dispatchDiscordSafely({ kind: "registration", username: user.username });

  return ok({
    sessionExpiresAt: session.expiresAt,
    sessionToken: session.token,
    viewer: toViewer(user)
  });
}

export async function loginUser(
  input: unknown,
  dependencies: AuthServiceDependencies,
  context: { clientIp?: string } = {}
): Promise<Result<AuthResult>> {
  const credentials = parseAuthCredentials(input);

  if (!credentials.ok) {
    return err(credentials.error);
  }

  // Keyed per client IP only: a per-username fallback would let anyone lock a
  // victim out, so without a trusted client IP the limiter is skipped. The
  // attempt is counted before the (slow) password check so concurrent
  // requests cannot all pass the check before any failure is recorded.
  const rateLimitKey = hasClientIp(context.clientIp) ? `login-ip:${context.clientIp}` : null;

  if (rateLimitKey !== null && !dependencies.failureRateLimiter.tryAcquire(rateLimitKey)) {
    return err(TOO_MANY_ATTEMPTS_MESSAGE);
  }

  const user = await dependencies.findUserByUsername(credentials.value.username);
  const passwordValid = await dependencies.verifyPassword(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    credentials.value.password
  );

  if (user === null || !passwordValid) {
    await recordAudit(dependencies, {
      action: "FAILED_LOGIN",
      actorUserId: null,
      metadata: { username: credentials.value.username },
      targetId: null,
      targetType: "SESSION"
    });
    triggerAlertsSafely();
    return err("Invalid username or password");
  }

  // A successful login does not count as a failure. Only this attempt is
  // refunded: clearing the key would let an attacker with a valid account
  // reset the counter between guesses.
  if (rateLimitKey !== null) {
    dependencies.failureRateLimiter.release(rateLimitKey);
  }

  const session = await dependencies.createSession(user.id);

  await recordAudit(dependencies, {
    action: "LOGIN",
    actorUserId: user.id,
    metadata: { username: user.username },
    targetId: session.id,
    targetType: "SESSION"
  });
  triggerAlertsSafely();

  return ok({
    sessionExpiresAt: session.expiresAt,
    sessionToken: session.token,
    viewer: toViewer(user)
  });
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

  const rateLimitKey = `password-change-user:${input.actor.id}`;

  if (!dependencies.failureRateLimiter.tryAcquire(rateLimitKey)) {
    return err(TOO_MANY_ATTEMPTS_MESSAGE);
  }

  const user = await dependencies.findUserById(input.actor.id);

  if (user === null) {
    return err("User was not found");
  }

  if (!(await dependencies.verifyPassword(user.passwordHash, passwordInput.value.currentPassword))) {
    await recordAudit(dependencies, {
      action: "FAILED_LOGIN",
      actorUserId: user.id,
      metadata: {
        attemptedAction: "USER_PASSWORD_CHANGED",
        username: user.username
      },
      targetId: user.id,
      targetType: "USER"
    });
    triggerAlertsSafely();
    return err("Current password is incorrect");
  }

  dependencies.failureRateLimiter.release(rateLimitKey);

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
  triggerAlertsSafely();

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

function hasClientIp(clientIp: string | undefined): clientIp is string {
  return clientIp !== undefined && clientIp.length > 0;
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

async function recordAudit(
  dependencies: AuthServiceDependencies,
  input: AuditRecordInput
): Promise<void> {
  assertNoCoordinateMetadata(input.metadata);
  await dependencies.recordAudit(input);
}
