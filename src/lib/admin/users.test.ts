import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchDiscordNotification: vi.fn(async () => ({ ok: true as const, value: null })),
  triggerAlertDetection: vi.fn()
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

vi.mock("@/lib/discord/discord-service", () => ({
  dispatchDiscordNotification: mocks.dispatchDiscordNotification
}));

vi.mock("@/lib/discord/database", () => ({
  createDiscordDependencies: vi.fn(() => ({}))
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
  mapPermissions: [],
  username: "root"
} as const;

const operatorActor = {
  accessLevel: "NONE",
  approvalStatus: "APPROVED",
  id: "operator-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: true, mapId: "map-defiance" }
  ],
  username: "operator"
} as const;

const writerActor = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "writer-id",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "map-celebration" }
  ],
  username: "writer"
} as const;

type TestUser = {
  accessLevel: "NONE" | "READ" | "WRITE";
  approvedAt?: Date | null;
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

type TestDependencies = AdminUserDependencies & {
  deletedShareLinkScopes: { keepMapIds: readonly string[]; userId: string }[];
  users: Map<string, TestUser>;
};

function createDependencies(): TestDependencies {
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

  const deletedShareLinkScopes: TestDependencies["deletedShareLinkScopes"] = [];

  return {
    deleteShareLinksOutsideMaps: async (input) => {
      deletedShareLinkScopes.push(input);
    },
    deletedShareLinkScopes,
    findUser: async (userId) => users.get(userId) ?? null,
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
    updateUserPrivileges: async ({ approvedByUserId, isAdmin, mapPermissions, userId }) => {
      const user = users.get(userId);

      if (user === undefined) {
        return null;
      }

      const updated: TestUser = {
        ...user,
        accessLevel: "NONE" as const,
        isAdmin,
        mapPermissions,
        ...(approvedByUserId === null
          ? {}
          : {
              approvalStatus: "APPROVED" as const,
              approvedAt: new Date("2026-06-01T00:00:00.000Z"),
              approvedBy: { username: approvedByUserId }
            })
      };
      users.set(userId, updated);
      return updated;
    },
    users
  };
}

describe("admin user management", () => {
  let dependencies: TestDependencies;

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

  it("loads the target account directly instead of from the user list", async () => {
    dependencies.listUsers = async () => [];

    const result = await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-release" }],
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
    await expect(updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [],
      userId: "missing-user"
    }, dependencies)).resolves.toEqual({ ok: false, error: "User was not found" });
  });

  it("preserves permissions on inactive maps when a global admin edits an account", async () => {
    dependencies.users.set("user-1", {
      ...dependencies.users.get("user-1")!,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-celebration" },
        { accessLevel: "WRITE", isOperator: false, mapId: "map-retired" }
      ]
    });

    const result = await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "WRITE", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(result).toMatchObject({
      ok: true,
      value: {
        mapPermissions: [
          { accessLevel: "WRITE", isOperator: false, mapId: "map-defiance" },
          { accessLevel: "WRITE", isOperator: false, mapId: "map-retired" }
        ]
      }
    });
  });

  it("keeps approval metadata unchanged when editing an already approved account", async () => {
    const approvedAt = new Date("2026-01-01T00:00:00.000Z");
    dependencies.users.set("user-1", {
      ...dependencies.users.get("user-1")!,
      approvalStatus: "APPROVED",
      approvedAt,
      approvedBy: { username: "Original" }
    });
    const updateSpy = vi.spyOn(dependencies, "updateUserPrivileges");

    const result = await updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ approvedByUserId: null }));
    expect(result).toMatchObject({ ok: true, value: { approvedByUsername: "Original" } });
    expect(dependencies.users.get("user-1")?.approvedAt).toBe(approvedAt);
  });

  it("records the approver when a pending account is approved", async () => {
    const updateSpy = vi.spyOn(dependencies, "updateUserPrivileges");

    await updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ approvedByUserId: "operator-id" }));
  });

  it("sends a Discord approval notification when a pending account is approved", async () => {
    mocks.dispatchDiscordNotification.mockClear();

    const result = await updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchDiscordNotification).toHaveBeenCalledWith(
      { kind: "approval", username: "Mako", actorUsername: "operator" },
      expect.anything()
    );
  });

  it("does not send an approval notification when the account was already approved", async () => {
    mocks.dispatchDiscordNotification.mockClear();
    dependencies.users.set("user-1", {
      ...dependencies.users.get("user-1")!,
      approvalStatus: "APPROVED"
    });

    await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(mocks.dispatchDiscordNotification).not.toHaveBeenCalled();
  });

  it("does not let a Discord dispatch failure break the approval", async () => {
    mocks.dispatchDiscordNotification.mockImplementationOnce(() => {
      throw new Error("discord module exploded");
    });

    const result = await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies);

    expect(result.ok).toBe(true);
  });

  it("does not let operators approve rejected accounts", async () => {
    dependencies.users.set("user-1", {
      ...dependencies.users.get("user-1")!,
      approvalStatus: "REJECTED"
    });

    await expect(updateAdminUser({
      actor: operatorActor,
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-defiance" }],
      userId: "user-1"
    }, dependencies)).resolves.toEqual({ ok: false, error: "Operators cannot approve rejected accounts" });
  });

  it("deletes share links for maps the user can no longer read", async () => {
    await updateAdminUser({
      actor: adminActor,
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-defiance" },
        { accessLevel: "NONE", isOperator: false, mapId: "map-celebration" }
      ],
      userId: "user-1"
    }, dependencies);

    expect(dependencies.deletedShareLinkScopes).toEqual([
      { keepMapIds: ["map-defiance"], userId: "user-1" }
    ]);
  });

  it("keeps all share links for approved global admins", async () => {
    await updateAdminUser({
      actor: adminActor,
      isAdmin: true,
      mapPermissions: [],
      userId: "user-1"
    }, dependencies);

    expect(dependencies.deletedShareLinkScopes).toEqual([]);
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
  let dependencies: TestDependencies;

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
