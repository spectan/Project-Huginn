import { beforeEach, describe, expect, it } from "vitest";
import {
  listAdminUsers,
  removeAdminUser,
  updateAdminUser,
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
    username: string;
  }>([
    ["user-1", {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      id: "user-1",
      isAdmin: false,
      username: "Mako"
    }]
  ]);

  return {
    listUsers: async () => Array.from(users.values()),
    recordAudit: async () => undefined,
    removeUser: async ({ userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        accessLevel: "NONE" as const,
        approvalStatus: "REJECTED" as const,
        isAdmin: false
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

  it("removes an account by rejecting it and clearing privileges", async () => {
    const result = await removeAdminUser({
      actor: adminActor,
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        accessLevel: "NONE",
        approvalStatus: "REJECTED",
        isAdmin: false,
        username: "Mako"
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
