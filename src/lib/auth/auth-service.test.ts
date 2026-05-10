import { beforeEach, describe, expect, it } from "vitest";
import {
  approveUser,
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

function createDependencies(): AuthServiceDependencies {
  const users = new Map<string, {
    accessLevel: "NONE" | "READ" | "WRITE";
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    id: string;
    isAdmin: boolean;
    passwordHash: string;
    username: string;
  }>();

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
    findUserByUsername: async (username) => users.get(username.toLowerCase()) ?? null,
    hashPassword: async (password) => `hashed:${password}`,
    recordAudit: async () => undefined,
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
    verifyPassword: async (hash, password) => hash === `hashed:${password}`
  };
}

describe("auth service", () => {
  let deps: AuthServiceDependencies;

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
});
