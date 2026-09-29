import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    deed: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn()
    },
    note: {
      findUnique: vi.fn(),
      updateMany: vi.fn()
    }
  };

  return {
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    },
    transaction
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { createDeletedMarkerDependencies } from "./database";

const now = new Date("2026-09-29T12:00:00.000Z");

describe("createDeletedMarkerDependencies restoreDeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.deed.findFirst.mockResolvedValue({ disbandNoteId: "note-1" });
    mocks.transaction.deed.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.deed.findUniqueOrThrow.mockResolvedValue({ id: "deed-1", mapId: "map-1", x: 1, y: 2 });
  });

  it("retires the disband note only while it is live and still an Abandoned Deed note", async () => {
    mocks.transaction.note.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.note.findUnique.mockResolvedValue({ id: "note-1", x: 1, y: 2 });

    const restored = await createDeletedMarkerDependencies().markers.deed.restore("deed-1", {
      now,
      updatedByUserId: "admin"
    });

    expect(mocks.transaction.note.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: "Abandoned Deed", deletedAt: null, id: "note-1" }
    }));
    expect(restored).toEqual({
      id: "deed-1",
      mapId: "map-1",
      retiredNote: { id: "note-1", x: 1, y: 2 },
      x: 1,
      y: 2
    });
  });

  it("keeps a disband note that was recategorized or deleted", async () => {
    mocks.transaction.note.updateMany.mockResolvedValue({ count: 0 });

    const restored = await createDeletedMarkerDependencies().markers.deed.restore("deed-1", {
      now,
      updatedByUserId: "admin"
    });

    expect(mocks.transaction.note.findUnique).not.toHaveBeenCalled();
    expect(restored).toMatchObject({ id: "deed-1", retiredNote: null });
  });
});
