import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    session: { deleteMany: vi.fn() },
    user: { delete: vi.fn(), update: vi.fn() }
  }
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("argon2", () => ({ default: { hash: vi.fn() } }));

import { createAdminUserDependencies } from "./users-database";

const recordNotFound = Object.assign(new Error("Record to update not found."), { code: "P2025" });

describe("createAdminUserDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a concurrently deleted user to null when removing", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(recordNotFound);

    await expect(createAdminUserDependencies().removeUser({
      removedByUserId: "admin",
      userId: "gone"
    })).resolves.toBeNull();
  });

  it("maps a concurrently deleted user to null when changing a password", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(recordNotFound);

    await expect(createAdminUserDependencies().updateUserPassword({
      passwordHash: "hash",
      userId: "gone"
    })).resolves.toBeNull();
  });

  it("maps a concurrently deleted user to null when changing privileges", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(recordNotFound);

    await expect(createAdminUserDependencies().updateUserPrivileges({
      approvedByUserId: "admin",
      plan: () => ({ ok: true, value: { isAdmin: false, mapPermissions: [] } }),
      userId: "gone"
    })).resolves.toBeNull();
  });

  describe("updateUserPrivileges", () => {
    const existingUser = {
      accessLevel: "NONE",
      approvalStatus: "PENDING",
      createdAt: new Date(0),
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-a" }],
      username: "Mako"
    };

    function createTransaction(lockedRows: { id: string }[] = [{ id: "user-1" }], approvedCount = 1) {
      const calls: string[] = [];
      const tx = {
        $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
          calls.push(`lock:${query.join("?")}`);
          return lockedRows;
        }),
        user: {
          findUniqueOrThrow: vi.fn(async () => {
            calls.push("read");
            return existingUser;
          }),
          update: vi.fn(async () => {
            calls.push("update");
            return { id: "user-1" };
          }),
          updateMany: vi.fn(async () => {
            calls.push("approve");
            return { count: approvedCount };
          })
        },
        userMapPermission: {
          deleteMany: vi.fn(async () => {
            calls.push("deletePermissions");
          }),
          upsert: vi.fn(async () => {
            calls.push("upsertPermission");
          })
        }
      };
      mocks.prisma.$transaction.mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
      return { calls, tx };
    }

    it("locks the user row before reading it and plans against the locked state", async () => {
      const { calls, tx } = createTransaction();
      const plan = vi.fn(() => ({
        ok: true as const,
        value: {
          isAdmin: false,
          mapPermissions: [{ accessLevel: "WRITE" as const, isOperator: false, mapId: "map-b" }]
        }
      }));

      const result = await createAdminUserDependencies().updateUserPrivileges({
        approvedByUserId: "admin",
        plan,
        userId: "user-1"
      });

      expect(calls[0]).toMatch(/FROM "users" WHERE "id" = \? FOR UPDATE/);
      expect(calls.slice(1)).toEqual(["read", "approve", "update", "deletePermissions", "upsertPermission", "read"]);
      expect(plan).toHaveBeenCalledWith(existingUser);
      expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { approvalStatus: { not: "APPROVED" }, id: "user-1" }
      }));
      expect(result).toEqual({ ok: true, value: { approved: true, user: existingUser } });
    });

    it("reports no approval when the conditional approval changed nothing", async () => {
      createTransaction([{ id: "user-1" }], 0);

      const result = await createAdminUserDependencies().updateUserPrivileges({
        approvedByUserId: "admin",
        plan: () => ({ ok: true, value: { isAdmin: false, mapPermissions: [] } }),
        userId: "user-1"
      });

      expect(result).toMatchObject({ ok: true, value: { approved: false } });
    });

    it("writes nothing when the plan rejects the change", async () => {
      const { tx } = createTransaction();

      const result = await createAdminUserDependencies().updateUserPrivileges({
        approvedByUserId: "operator",
        plan: () => ({ ok: false, error: "Operators cannot change global admin accounts" }),
        userId: "user-1"
      });

      expect(result).toEqual({ ok: false, error: "Operators cannot change global admin accounts" });
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.userMapPermission.deleteMany).not.toHaveBeenCalled();
    });

    it("returns null when the user row does not exist", async () => {
      const { tx } = createTransaction([]);

      await expect(createAdminUserDependencies().updateUserPrivileges({
        approvedByUserId: "admin",
        plan: () => ({ ok: true, value: { isAdmin: false, mapPermissions: [] } }),
        userId: "gone"
      })).resolves.toBeNull();
      expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  it("rethrows other database errors", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "P1001" }));

    await expect(createAdminUserDependencies().removeUser({
      removedByUserId: "admin",
      userId: "user"
    })).rejects.toThrow("boom");
  });
});
