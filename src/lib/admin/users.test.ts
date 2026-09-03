import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn()
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

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
  isAdmin: true,
  mapPermissions: []
} as const;

const operatorActor = {
  accessLevel: "NONE",
  approvalStatus: "APPROVED",
  id: "operator-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: true, mapId: "map-defiance" }
  ]
} as const;

const writerActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "map-celebration" }
  ]
} as const;

type TestUser = {
  accessLevel: "NONE" | "READ" | "WRITE";
  approvedBy?: { username: string } | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  id: string;
  isAdmin: boolean;
  mapPermissions: readonly {
    accessLevel: "NONE" | "READ" | "WRITE";
    isOperator: boolean;
    mapId: string;
  }[];
  passwordHash: string;
  username: string;
};

function createDependencies(): AdminUserDependencies {
  const maps = [
    { id: "map-celebration", name: "Celebration" },
    { id: "map-defiance", name: "Defiance" },
    { id: "map-release", name: "Release" }
  ];
  const users = new Map<string, TestUser>([
    ["user-1", {
      accessLevel: "NONE",
      approvedBy: { username: "Admin" },
      approvalStatus: "PENDING",
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      id: "user-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-celebration" }
      ],
      passwordHash: "old-hash",
      username: "Mako"
    }],
    ["admin-target", {
      accessLevel: "NONE",
      approvedBy: null,
      approvalStatus: "APPROVED",
      createdAt: new Date("2026-05-11T00:00:00.000Z"),
      id: "admin-target",
      isAdmin: true,
      mapPermissions: [],
      passwordHash: "admin-hash",
      username: "Root"
    }]
  ]);

  return {
    hashPassword: async (password) => `hashed:${password}`,
    listMaps: async () => maps,
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
    updateUserPrivileges: async ({ isAdmin, mapPermissions, userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      const updated = {
        ...user,
        accessLevel: "NONE" as const,
        approvalStatus: "APPROVED" as const,
        isAdmin,
        mapPermissions
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

  it("lists users for global admins with all server permission summaries", async () => {
    const result = await listAdminUsers({ actor: adminActor }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: {
        maps: [
          { id: "map-celebration", name: "Celebration" },
          { id: "map-defiance", name: "Defiance" },
          { id: "map-release", name: "Release" }
        ],
        viewerCanManageGlobalAccounts: true,
        users: [
          {
            accessLevel: "NONE",
            approvedByUsername: "Admin",
            approvalStatus: "PENDING",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            mapPermissions: [
              { accessLevel: "READ", isOperator: false, mapId: "map-celebration" }
            ],
            username: "Mako"
          },
          {
            accessLevel: "NONE",
            approvedByUsername: null,
            approvalStatus: "APPROVED",
            createdAt: "2026-05-11T00:00:00.000Z",
            id: "admin-target",
            isAdmin: true,
            mapPermissions: [],
            username: "Root"
          }
        ]
      }
    });
  });

  it("lists users for scoped operators with only operated server summaries", async () => {
    const result = await listAdminUsers({ actor: operatorActor }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        maps: [
          { id: "map-defiance", name: "Defiance" }
        ],
        users: [
          {
            id: "user-1",
            mapPermissions: []
          },
          {
            id: "admin-target",
            mapPermissions: []
          }
        ],
        viewerCanManageGlobalAccounts: false
      }
    });
  });

  it("blocks users without global admin or operator privileges from listing users", async () => {
    const blocked = await listAdminUsers({ actor: writerActor }, dependencies);

    expect(blocked).toEqual({
      ok: false,
      error: "Admin access is required"
    });
  });

  it("lets global admins update global admin and all server permissions", async () => {
    const audits: unknown[] = [];
    dependencies = {
      ...dependencies,
      recordAudit: async (input) => {
        audits.push(input);
      }
    };

    const result = await updateAdminUser({
      actor: adminActor,
      isAdmin: true,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: true, mapId: "map-celebration" },
        { accessLevel: "READ", isOperator: false, mapId: "map-defiance" }
      ],
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        approvalStatus: "APPROVED",
        isAdmin: true,
        mapPermissions: [
          { accessLevel: "WRITE", isOperator: true, mapId: "map-celebration" },
          { accessLevel: "READ", isOperator: false, mapId: "map-defiance" }
        ],
        username: "Mako"
      }
    });
    expect(audits).toContainEqual({
      action: "PERMISSION_CHANGED",
      actorUserId: "admin-id",
      metadata: {
        isAdmin: true,
        mapPermissions: [
          { accessLevel: "WRITE", isOperator: true, mapId: "map-celebration" },
          { accessLevel: "READ", isOperator: false, mapId: "map-defiance" }
        ],
        username: "Mako"
      },
      targetId: "user-1",
      targetType: "USER"
    });
  });

  it("lets operators approve and update only permissions for operated servers", async () => {
    const result = await updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: true, mapId: "map-defiance" }
      ],
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        approvalStatus: "APPROVED",
        isAdmin: false,
        mapPermissions: [
          { accessLevel: "WRITE", isOperator: true, mapId: "map-defiance" }
        ],
        username: "Mako"
      }
    });
  });

  it("rejects operator attempts to edit global admins, global admin status, or unoperated servers", async () => {
    await expect(updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: false, mapId: "map-defiance" }
      ],
      userId: "admin-target"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Operators cannot change global admin accounts"
    });

    await expect(updateAdminUser({
      actor: operatorActor,
      isAdmin: true,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: false, mapId: "map-defiance" }
      ],
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Operators cannot grant global admin access"
    });

    await expect(updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-release" }
      ],
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Operators can only change permissions for their operated servers"
    });
  });

  it("keeps password changes and account deletion global-admin only", async () => {
    await expect(updateAdminUserPassword({
      actor: operatorActor,
      password: "new-secure-password",
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Admin access is required"
    });

    await expect(removeAdminUser({
      actor: operatorActor,
      userId: "user-1"
    }, dependencies)).resolves.toEqual({
      ok: false,
      error: "Admin access is required"
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
          accessLevel: "NONE",
          approvalStatus: "APPROVED",
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
          id: input.userId,
          isAdmin: false,
          mapPermissions: [],
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

  it("rejects invalid account password changes", async () => {
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

    expect(users).toMatchObject({
      ok: true,
      value: {
        users: [
          {
            id: "admin-target",
            username: "Root"
          }
        ]
      }
    });
  });

  it("does not let admins change or remove their own account", async () => {
    await expect(updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [],
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

describe("admin user management alert detection triggers", () => {
  let dependencies: AdminUserDependencies;

  beforeEach(() => {
    mocks.triggerAlertDetection.mockReset();
    dependencies = createDependencies();
  });

  it("triggers alert detection after removing an account", async () => {
    const result = await removeAdminUser({
      actor: adminActor,
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a failed authorization", async () => {
    const result = await removeAdminUser({
      actor: operatorActor,
      userId: "user-1"
    }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after a permission change", async () => {
    const result = await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: false, mapId: "map-release" }
      ],
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("triggers alert detection after an admin password change", async () => {
    const result = await updateAdminUserPassword({
      actor: adminActor,
      password: "new secure password",
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not let a synchronous trigger failure break the mutation", async () => {
    mocks.triggerAlertDetection.mockImplementation(() => {
      throw new Error("alert pipeline exploded");
    });

    const result = await removeAdminUser({
      actor: adminActor,
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
  });
});
