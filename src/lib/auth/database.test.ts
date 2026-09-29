import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(async (query: TemplateStringsArray, ...values: unknown[]) => {
      void values;
      return query.length;
    }),
    user: {
      aggregate: vi.fn(async () => ({ _max: { watermarkNumber: 41 as number | null } })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-user", ...data })),
      findFirst: vi.fn(async () => null as null | { id: string })
    }
  };

  return {
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    },
    tx
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("argon2", () => ({ default: { hash: vi.fn(), verify: vi.fn() } }));

import { createAuthDependencies } from "./database";

describe("createAuthDependencies createUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes creation with an advisory lock and allocates the next watermark number", async () => {
    const user = await createAuthDependencies().createUser({ passwordHash: "hash", username: "Mako" });

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.calls[0]?.[0].join("")).toContain("pg_advisory_xact_lock");
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { username: { equals: "Mako", mode: "insensitive" } }
    }));
    expect(mocks.tx.user.aggregate).toHaveBeenCalledWith({ _max: { watermarkNumber: true } });
    expect(user).toMatchObject({ username: "Mako", watermarkNumber: 42 });
  });

  it("starts watermark numbers at 1 when no user has one", async () => {
    mocks.tx.user.aggregate.mockResolvedValueOnce({ _max: { watermarkNumber: null } });

    await expect(createAuthDependencies().createUser({ passwordHash: "hash", username: "Mako" }))
      .resolves.toMatchObject({ watermarkNumber: 1 });
  });

  it("returns null when the username exists with different casing", async () => {
    mocks.tx.user.findFirst.mockResolvedValueOnce({ id: "existing" });

    await expect(createAuthDependencies().createUser({ passwordHash: "hash", username: "mako" }))
      .resolves.toBeNull();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });

  it("maps a unique constraint violation to null", async () => {
    mocks.tx.user.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(createAuthDependencies().createUser({ passwordHash: "hash", username: "Mako" }))
      .resolves.toBeNull();
  });
});
