import { beforeEach, describe, expect, it } from "vitest";
import {
  listAdminUsers,
  removeAdminUser,
  updateAdminUser,
  updateAdminUserPassword,
  type AdminUserDependencies
} from "./users";

const adminActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-id",
  isAdmin: true
} as const;

const writerActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false
} as const;

function createDependencies(): AdminUserDependencies {
  const users = new Map<string, {
    accessLevel: "NONE" | "READ" | "WRITE";
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: Date;
    id: string;
    isAdmin: boolean;
    passwordHash: string;
    username: string;
  }>([
    ["user-1", {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      id: "user-1",
      isAdmin: false,
      passwordHash: "old-hash",
      username: "Mako"
    }]
  ]);

  return {
    hashPassword: async (password) => `hashed:${password}`,
    listUsers: async () => Array.from(users.values()),
    recordAudit: async () => undefined,
    removeUser: async ({ userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      users.delete(userId);
      return user;
    },
    updateUserPassword: async ({ passwordHash, userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        passwordHash
      };
      users.set(userId, updated);
      return updated;
    },
    updateUserPrivileges: async ({ accessLevel, isAdmin, userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        accessLevel,
        approvalStatus: "APPROVED" as const,
        isAdmin
      };
      users.set(userId, updated);
      return updated;
    }
  };
}

describe("admin user management", () => {
  let dependencies: AdminUserDependencies;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  it("lists users only for admins", async () => {
    const blocked = await listAdminUsers({ actor: writerActor }, dependencies);

    expect(blocked).toEqual({
      ok: false,
      error: "Admin access is required"
    });

    const result = await listAdminUsers({ actor: adminActor }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: {
        users: [
          {
            accessLevel: "READ",
            approvalStatus: "APPROVED",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            username: "Mako"
          }
        ]
      }
    });
  });

  it("updates read/write/admin privileges and audits the change", async () => {
    const audits: unknown[] = [];
    dependencies = {
      ...dependencies,
      recordAudit: async (input) => {
        audits.push(input);
      }
    };

    const result = await updateAdminUser({
      accessLevel: "WRITE",
      actor: adminActor,
      isAdmin: true,
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        accessLevel: "WRITE",
        isAdmin: true,
        username: "Mako"
      }
    });
    expect(audits).toContainEqual({
      action: "PERMISSION_CHANGED",
      actorUserId: "admin-id",
      metadata: {
        accessLevel: "WRITE",
        isAdmin: true,
        username: "Mako"
      },
      targetId: "user-1",
      targetType: "USER"
    });
  });

  it("updates account passwords for admins and audits without password metadata", async () => {
    const audits: unknown[] = [];
    const passwordUpdates: unknown[] = [];
    dependencies = {
      ...dependencies,
      recordAudit: async (input) => {
        audits.push(input);
      },
      updateUserPassword: async (input) => {
        passwordUpdates.push(input);
        return {
          accessLevel: "READ",
          approvalStatus: "APPROVED",
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
          id: input.userId,
          isAdmin: false,
          passwordHash: input.passwordHash,
          username: "Mako"
        };
      }
    };

    const result = await updateAdminUserPassword({
      actor: adminActor,
      password: "new-secure-password",
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "user-1",
        username: "Mako"
      }
    });
    expect(passwordUpdates).toEqual([
      {
        passwordHash: "hashed:new-secure-password",
        userId: "user-1"
      }
    ]);
    expect(audits).toContainEqual({
      action: "USER_PASSWORD_CHANGED",
      actorUserId: "admin-id",
      metadata: {
        username: "Mako"
      },
      targetId: "user-1",
      targetType: "USER"
    });
  });

  it("rejects non-admin and invalid account password changes", async () => {
    await expect(updateAdminUserPassword({
      actor: writerActor,
      password: "new-secure-password",
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Admin access is required"
    });

    await expect(updateAdminUserPassword({
      actor: adminActor,
      password: "too-short",
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Password must be 12-128 characters"
    });
  });

  it("removes an account by deleting it from the user list", async () => {
    const result = await removeAdminUser({
      actor: adminActor,
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "user-1",
        username: "Mako"
      }
    });

    const users = await listAdminUsers({ actor: adminActor }, dependencies);

    expect(users).toEqual({
      ok: true,
      value: {
        users: []
      }
    });
  });

  it("does not let admins change or remove their own account", async () => {
    await expect(updateAdminUser({
      accessLevel: "READ",
      actor: adminActor,
      isAdmin: false,
      userId: "admin-id"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Admins cannot change their own account"
    });

    await expect(removeAdminUser({
      actor: adminActor,
      userId: "admin-id"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Admins cannot remove their own account"
    });
  });
});
