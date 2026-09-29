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
      approvedByUserId: null,
      isAdmin: false,
      mapPermissions: [],
      userId: "gone"
    })).resolves.toBeNull();
  });

  it("rethrows other database errors", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "P1001" }));

    await expect(createAdminUserDependencies().removeUser({
      removedByUserId: "admin",
      userId: "user"
    })).rejects.toThrow("boom");
  });
});
