import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

import {
  ensureInitialAdmin,
  USER_CREATION_LOCK_KEY,
  validateInitialAdminPassword
} from "./seed-admin-config.mjs";

describe("seed admin config", () => {
  it("rejects known placeholder admin passwords", () => {
    expect(validateInitialAdminPassword("replace-before-use")).toEqual({
      error: "INITIAL_ADMIN_PASSWORD must be changed from the example placeholder",
      ok: false
    });
  });

  it("accepts a non-placeholder admin password with the required length", () => {
    expect(validateInitialAdminPassword("correct horse battery staple")).toEqual({
      ok: true,
      value: "correct horse battery staple"
    });
  });
});

type FakeUser = {
  approvalStatus: string;
  id: string;
  isAdmin: boolean;
  passwordHash?: string;
  username: string;
  watermarkNumber: number | null;
};

function createFakePrisma(users: FakeUser[]) {
  const lockCalls: unknown[][] = [];
  const tx = {
    $executeRaw: vi.fn(async (...args: unknown[]) => {
      lockCalls.push(args);
      return 1;
    }),
    user: {
      aggregate: vi.fn(async () => ({
        _max: {
          watermarkNumber: users.reduce<number | null>(
            (max, user) => user.watermarkNumber === null ? max : Math.max(max ?? 0, user.watermarkNumber),
            null
          )
        }
      })),
      create: vi.fn(async ({ data }: { data: Omit<FakeUser, "id"> }) => {
        const user = { ...data, id: `user-${users.length + 1}` };
        users.push(user);
        return user;
      }),
      findFirst: vi.fn(async ({ where }: { where: { username: { equals: string; mode: string } } }) =>
        users.find((user) => user.username.toLowerCase() === where.username.equals.toLowerCase()) ?? null),
      update: vi.fn(async ({ data, where }: { data: Partial<FakeUser>; where: { id: string } }) => {
        const user = users.find((candidate) => candidate.id === where.id);
        Object.assign(user ?? {}, data);
        return user;
      })
    }
  };

  return {
    lockCalls,
    prisma: { $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) },
    tx,
    users
  };
}

const hashPassword = async (value: string) => `hashed:${value}`;

describe("ensureInitialAdmin", () => {
  it("creates the admin under the registration lock with the next watermark number", async () => {
    const fake = createFakePrisma([
      { approvalStatus: "APPROVED", id: "u1", isAdmin: false, username: "bob", watermarkNumber: 7 }
    ]);

    const result = await ensureInitialAdmin(fake.prisma, {
      hashPassword,
      password: "correct horse battery staple",
      username: "admin"
    });

    expect(result).toEqual({ ok: true, status: "created", username: "admin" });
    expect(fake.lockCalls[0]?.[1]).toBe(USER_CREATION_LOCK_KEY);
    expect(fake.users[1]).toMatchObject({
      isAdmin: true,
      passwordHash: "hashed:correct horse battery staple",
      username: "admin",
      watermarkNumber: 8
    });
  });

  it("leaves an existing approved admin unchanged and needs no password", async () => {
    const fake = createFakePrisma([
      { approvalStatus: "APPROVED", id: "u1", isAdmin: true, passwordHash: "old", username: "Admin", watermarkNumber: 1 }
    ]);

    const result = await ensureInitialAdmin(fake.prisma, { hashPassword, password: undefined, username: "admin" });

    expect(result).toEqual({ ok: true, status: "existing", username: "Admin" });
    expect(fake.tx.user.create).not.toHaveBeenCalled();
    expect(fake.users[0]?.passwordHash).toBe("old");
  });

  it("backfills a missing watermark number for an existing admin", async () => {
    const fake = createFakePrisma([
      { approvalStatus: "APPROVED", id: "u1", isAdmin: true, username: "admin", watermarkNumber: null },
      { approvalStatus: "APPROVED", id: "u2", isAdmin: false, username: "bob", watermarkNumber: 4 }
    ]);

    await ensureInitialAdmin(fake.prisma, { hashPassword, password: undefined, username: "admin" });

    expect(fake.users[0]?.watermarkNumber).toBe(5);
  });

  it("refuses to adopt an existing account that is not an approved admin (case-insensitive)", async () => {
    const fake = createFakePrisma([
      { approvalStatus: "PENDING", id: "u1", isAdmin: false, username: "ADMIN", watermarkNumber: 1 }
    ]);

    const result = await ensureInitialAdmin(fake.prisma, {
      hashPassword,
      password: "correct horse battery staple",
      username: "admin"
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("not an approved admin");
    expect(fake.tx.user.create).not.toHaveBeenCalled();
    expect(fake.tx.user.update).not.toHaveBeenCalled();
  });

  it("rejects a missing password when the admin must be created", async () => {
    const fake = createFakePrisma([]);

    const result = await ensureInitialAdmin(fake.prisma, { hashPassword, password: undefined, username: "admin" });

    expect(result).toEqual({ error: "INITIAL_ADMIN_PASSWORD must be set to at least 12 characters", ok: false });
    expect(fake.tx.user.create).not.toHaveBeenCalled();
  });

  it("uses the same lock key as registration", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth/database.ts"), "utf8");
    const match = /USER_CREATION_LOCK_KEY = ([\d_]+);/.exec(source);

    expect(Number(match?.[1]?.replaceAll("_", ""))).toBe(USER_CREATION_LOCK_KEY);
  });
});
