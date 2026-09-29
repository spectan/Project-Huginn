import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn()
}));

const discordMocks = vi.hoisted(() => ({
  dispatchDiscordNotification: vi.fn(async () => ({ ok: true as const, value: null }))
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

vi.mock("@/lib/discord/discord-service", () => ({
  dispatchDiscordNotification: discordMocks.dispatchDiscordNotification
}));

vi.mock("@/lib/discord/database", () => ({
  createDiscordDependencies: vi.fn(() => ({}))
}));

import {
  changeOwnPassword,
  type AuthServiceDependencies,
  loginUser,
  registerUser,
  TOO_MANY_ATTEMPTS_MESSAGE
} from "./auth-service";
import { createFailureRateLimiter } from "./failure-rate-limiter";

type TestAuthServiceDependencies = AuthServiceDependencies & {
  __test: {
    audits: unknown[];
    passwordUpdates: Array<{ currentSessionTokenHash: string | null; passwordHash: string; userId: string }>;
  };
};

function createDependencies(): TestAuthServiceDependencies {
  const users = new Map<string, {
    accessLevel: "NONE" | "READ" | "WRITE";
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    id: string;
    isAdmin: boolean;
    passwordHash: string;
    username: string;
  }>();
  const passwordUpdates: Array<{ currentSessionTokenHash: string | null; passwordHash: string; userId: string }> = [];
  const audits: unknown[] = [];

  return {
    createSession: async (userId) => ({
      expiresAt: new Date("2026-05-24T00:00:00.000Z"),
      id: `session-id-${userId}`,
      token: `session-${userId}`
    }),
    createUser: async (data) => {
      if (users.has(data.username.toLowerCase())) {
        return null;
      }

      const user = {
        accessLevel: "NONE" as const,
        approvalStatus: "PENDING" as const,
        id: `user-${users.size + 1}`,
        isAdmin: false,
        passwordHash: data.passwordHash,
        username: data.username
      };
      users.set(data.username.toLowerCase(), user);
      return user;
    },
    failureRateLimiter: createFailureRateLimiter(),
    findUserById: async (userId) => Array.from(users.values()).find((user) => user.id === userId) ?? null,
    findUserByUsername: async (username) => users.get(username.toLowerCase()) ?? null,
    hashPassword: async (password) => `hashed:${password}`,
    recordAudit: async (input) => {
      audits.push(input);
    },
    registrationRateLimiter: createFailureRateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 }),
    updateUserPassword: async (input) => {
      passwordUpdates.push(input);
      const user = Array.from(users.values()).find((candidate) => candidate.id === input.userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        passwordHash: input.passwordHash
      };
      users.set(user.username.toLowerCase(), updated);
      return updated;
    },
    verifyPassword: async (hash, password) => hash === `hashed:${password}`,
    __test: {
      audits,
      passwordUpdates
    }
  };
}

describe("auth service", () => {
  let deps: TestAuthServiceDependencies;

  beforeEach(() => {
    deps = createDependencies();
  });

  it("registers a pending user and creates a session", async () => {
    const result = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionToken: "session-user-1",
        viewer: {
          approvalStatus: "PENDING",
          permissions: "NONE",
          username: "Mako"
        }
      }
    });
  });

  it("does not allow duplicate registration usernames", async () => {
    await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    const result = await registerUser({
      password: "correct horse battery staple",
      username: "mako"
    }, deps);

    expect(result).toEqual({
      ok: false,
      error: "Username is already registered"
    });
  });

  it("logs in a user with valid credentials", async () => {
    await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    const result = await loginUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionToken: "session-user-1",
        viewer: {
          username: "Mako"
        }
      }
    });
  });

  it("uses a generic login error for bad credentials", async () => {
    const result = await loginUser({
      password: "correct horse battery staple",
      username: "Unknown"
    }, deps);

    expect(result).toEqual({
      ok: false,
      error: "Invalid username or password"
    });
  });

  it("reports a taken username when creation loses a registration race", async () => {
    deps.findUserByUsername = async () => null;
    deps.createUser = async () => null;

    const result = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result).toEqual({ ok: false, error: "Username is already registered" });
  });

  it("verifies against a dummy hash when the username does not exist", async () => {
    const verifyPassword = vi.fn<(hash: string, password: string) => Promise<boolean>>(async () => false);
    deps.verifyPassword = verifyPassword;

    await loginUser({ password: "correct horse battery staple", username: "Ghost" }, deps);

    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword.mock.calls[0]?.[0]).toMatch(/^\$argon2id\$/);
  });

  it("rate limits login failures per client IP without counting successful logins", async () => {
    await registerUser({ password: "correct horse battery staple", username: "Mako" }, deps);

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await loginUser({ password: "wrong horse battery staple", username: "Mako" }, deps, { clientIp: "203.0.113.1" });
    }

    await expect(loginUser(
      { password: "correct horse battery staple", username: "Mako" },
      deps,
      { clientIp: "203.0.113.1" }
    )).resolves.toMatchObject({ ok: true });

    await loginUser({ password: "wrong horse battery staple", username: "Mako" }, deps, { clientIp: "203.0.113.1" });

    await expect(loginUser(
      { password: "correct horse battery staple", username: "Mako" },
      deps,
      { clientIp: "203.0.113.1" }
    )).resolves.toEqual({ ok: false, error: TOO_MANY_ATTEMPTS_MESSAGE });
    await expect(loginUser(
      { password: "correct horse battery staple", username: "Mako" },
      deps,
      { clientIp: "203.0.113.2" }
    )).resolves.toMatchObject({ ok: true });
  });

  it("does not rate limit by username when the client IP is unknown", async () => {
    await registerUser({ password: "correct horse battery staple", username: "Mako" }, deps);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await loginUser({ password: "wrong horse battery staple", username: "Mako" }, deps);
    }

    await expect(loginUser({ password: "correct horse battery staple", username: "Mako" }, deps))
      .resolves.toMatchObject({ ok: true });
  });

  it("counts concurrent login attempts before verifying passwords", async () => {
    await registerUser({ password: "correct horse battery staple", username: "Mako" }, deps);
    const verifyPassword = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return false;
    });
    deps.verifyPassword = verifyPassword;

    const results = await Promise.all(Array.from({ length: 25 }, () => loginUser(
      { password: "wrong horse battery staple", username: "Mako" },
      deps,
      { clientIp: "203.0.113.5" }
    )));

    expect(verifyPassword).toHaveBeenCalledTimes(10);
    expect(results.filter((result) => !result.ok && result.error === TOO_MANY_ATTEMPTS_MESSAGE)).toHaveLength(15);
  });

  it("rate limits registration attempts per client IP, skipping unknown IPs", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await registerUser({ password: "short", username: `User${attempt}` }, deps, { clientIp: "203.0.113.8" });
    }

    await expect(registerUser(
      { password: "correct horse battery staple", username: "Mako" },
      deps,
      { clientIp: "203.0.113.8" }
    )).resolves.toEqual({ ok: false, error: TOO_MANY_ATTEMPTS_MESSAGE });
    await expect(registerUser(
      { password: "correct horse battery staple", username: "Mako" },
      deps
    )).resolves.toMatchObject({ ok: true });
  });

  it("audits and rate limits wrong current passwords on self-service password changes", async () => {
    const registered = await registerUser({ password: "correct horse battery staple", username: "Mako" }, deps);

    if (!registered.ok) {
      throw new Error("registration failed");
    }

    const attempt = (currentPassword: string) => changeOwnPassword({
      actor: { id: registered.value.viewer.id },
      currentSessionTokenHash: null,
      input: {
        confirmPassword: "new secure password",
        currentPassword,
        newPassword: "new secure password"
      }
    }, deps);

    await attempt("wrong horse battery staple");

    expect(deps.__test.audits).toContainEqual({
      action: "FAILED_LOGIN",
      actorUserId: registered.value.viewer.id,
      metadata: { attemptedAction: "USER_PASSWORD_CHANGED", username: "Mako" },
      targetId: registered.value.viewer.id,
      targetType: "USER"
    });

    for (let count = 1; count < 10; count += 1) {
      await attempt("wrong horse battery staple");
    }

    await expect(attempt("correct horse battery staple")).resolves.toEqual({
      ok: false,
      error: TOO_MANY_ATTEMPTS_MESSAGE
    });
    expect(deps.__test.passwordUpdates).toEqual([]);
  });

  it("changes the current user's password after verifying the current password", async () => {
    const registered = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(registered.ok).toBe(true);

    if (!registered.ok) {
      return;
    }

    const result = await changeOwnPassword({
      actor: {
        id: registered.value.viewer.id
      },
      currentSessionTokenHash: "current-session-hash",
      input: {
        confirmPassword: "new secure password",
        currentPassword: "correct horse battery staple",
        newPassword: "new secure password"
      }
    }, deps);

    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(deps.__test.passwordUpdates).toEqual([
      {
        currentSessionTokenHash: "current-session-hash",
        passwordHash: "hashed:new secure password",
        userId: registered.value.viewer.id
      }
    ]);
    expect(deps.__test.audits).toContainEqual({
      action: "USER_PASSWORD_CHANGED",
      actorUserId: registered.value.viewer.id,
      metadata: {
        username: "Mako"
      },
      targetId: registered.value.viewer.id,
      targetType: "USER"
    });
  });

  it("rejects self-service password changes when current password is wrong", async () => {
    const registered = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(registered.ok).toBe(true);

    if (!registered.ok) {
      return;
    }

    const result = await changeOwnPassword({
      actor: {
        id: registered.value.viewer.id
      },
      currentSessionTokenHash: "current-session-hash",
      input: {
        confirmPassword: "new secure password",
        currentPassword: "wrong horse battery staple",
        newPassword: "new secure password"
      }
    }, deps);

    expect(result).toEqual({
      ok: false,
      error: "Current password is incorrect"
    });
    expect(deps.__test.passwordUpdates).toEqual([]);
  });

  it("rejects self-service password changes when confirmation does not match", async () => {
    const registered = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(registered.ok).toBe(true);

    if (!registered.ok) {
      return;
    }

    const result = await changeOwnPassword({
      actor: {
        id: registered.value.viewer.id
      },
      currentSessionTokenHash: "current-session-hash",
      input: {
        confirmPassword: "different secure password",
        currentPassword: "correct horse battery staple",
        newPassword: "new secure password"
      }
    }, deps);

    expect(result).toEqual({
      ok: false,
      error: "New passwords do not match"
    });
    expect(deps.__test.passwordUpdates).toEqual([]);
  });
});

describe("auth service alert detection triggers", () => {
  let deps: TestAuthServiceDependencies;

  beforeEach(() => {
    mocks.triggerAlertDetection.mockReset();
    deps = createDependencies();
  });

  it("triggers alert detection after a successful registration", async () => {
    const result = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a successful login", async () => {
    await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);
    mocks.triggerAlertDetection.mockClear();

    const result = await loginUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a failed login", async () => {
    const result = await loginUser({
      password: "correct horse battery staple",
      username: "ghost"
    }, deps);

    expect(result.ok).toBe(false);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a password change", async () => {
    const registered = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(registered.ok).toBe(true);

    if (!registered.ok) {
      return;
    }

    mocks.triggerAlertDetection.mockClear();

    const result = await changeOwnPassword({
      actor: { id: registered.value.viewer.id },
      currentSessionTokenHash: "current-session-hash",
      input: {
        confirmPassword: "new secure password",
        currentPassword: "correct horse battery staple",
        newPassword: "new secure password"
      }
    }, deps);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not let a synchronous trigger failure break the mutation", async () => {
    await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);
    mocks.triggerAlertDetection.mockImplementation(() => {
      throw new Error("alert pipeline exploded");
    });

    const result = await loginUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result.ok).toBe(true);
  });
});

describe("auth service discord dispatch", () => {
  let deps: TestAuthServiceDependencies;

  beforeEach(() => {
    discordMocks.dispatchDiscordNotification.mockClear();
    deps = createDependencies();
  });

  it("dispatches a registration notification after a successful registration", async () => {
    const result = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result.ok).toBe(true);
    expect(discordMocks.dispatchDiscordNotification).toHaveBeenCalledTimes(1);
    expect(discordMocks.dispatchDiscordNotification).toHaveBeenCalledWith(
      { kind: "registration", username: "Mako" },
      expect.anything()
    );
  });

  it("does not dispatch a registration notification for duplicate usernames", async () => {
    await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);
    discordMocks.dispatchDiscordNotification.mockClear();

    const result = await registerUser({
      password: "correct horse battery staple",
      username: "mako"
    }, deps);

    expect(result.ok).toBe(false);
    expect(discordMocks.dispatchDiscordNotification).not.toHaveBeenCalled();
  });

  it("does not let a synchronous dispatch failure break registration", async () => {
    discordMocks.dispatchDiscordNotification.mockImplementationOnce(() => {
      throw new Error("discord module exploded");
    });

    const result = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(result.ok).toBe(true);
  });
});
