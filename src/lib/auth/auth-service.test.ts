import { beforeEach, describe, expect, it } from "vitest";
import {
  approveUser,
  changeOwnPassword,
  type AuthServiceDependencies,
  loginUser,
  registerUser
} from "./auth-service";

const adminActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-id",
  isAdmin: true
} as const;

const nonAdminActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false
} as const;

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
    findUserById: async (userId) => Array.from(users.values()).find((user) => user.id === userId) ?? null,
    findUserByUsername: async (username) => users.get(username.toLowerCase()) ?? null,
    hashPassword: async (password) => `hashed:${password}`,
    recordAudit: async (input) => {
      audits.push(input);
    },
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
    updateUserApproval: async (input) => {
      const user = Array.from(users.values()).find((candidate) => candidate.id === input.userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        accessLevel: input.accessLevel,
        approvalStatus: "APPROVED" as const
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

  it("approves pending users only for admins", async () => {
    const registered = await registerUser({
      password: "correct horse battery staple",
      username: "Mako"
    }, deps);

    expect(registered.ok).toBe(true);

    if (!registered.ok) {
      return;
    }

    const blocked = await approveUser({
      accessLevel: "READ",
      actor: nonAdminActor,
      userId: registered.value.viewer.id
    }, deps);

    expect(blocked).toEqual({
      ok: false,
      error: "Admin access is required"
    });

    const approved = await approveUser({
      accessLevel: "WRITE",
      actor: adminActor,
      userId: registered.value.viewer.id
    }, deps);

    expect(approved).toMatchObject({
      ok: true,
      value: {
        approvalStatus: "APPROVED",
        permissions: "WRITE",
        username: "Mako"
      }
    });
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
