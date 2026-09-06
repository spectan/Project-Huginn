import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditHistoryDependencies } from "./database";

const mocks = vi.hoisted(() => ({
  auditEventFindMany: vi.fn(async () => []),
  mapFindMany: vi.fn(async () => []),
  userFindMany: vi.fn(async () => [])
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: {
      findMany: mocks.auditEventFindMany
    },
    map: {
      findMany: mocks.mapFindMany
    },
    user: {
      findMany: mocks.userFindMany
    }
  }
}));

describe("createAuditHistoryDependencies listEvents", () => {
  beforeEach(() => {
    mocks.auditEventFindMany.mockClear();
  });

  it("queries newest first without a where clause by default", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listEvents({ before: null, limit: 10 });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      where: {}
    }));
  });

  it("applies the delete action group as an in-list filter", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listEvents({ actionGroup: "delete", before: null, limit: 10 });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        action: { in: ["MARKER_DELETED", "MARKER_CLEANED_UP"] }
      }
    }));
  });

  it("applies the other action group as a notIn filter", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listEvents({ actionGroup: "other", before: null, limit: 10 });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        action: {
          notIn: ["MARKER_CREATED", "MARKER_UPDATED", "MARKER_DELETED", "MARKER_CLEANED_UP"]
        }
      }
    }));
  });

  it("combines user, map and action group filters", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listEvents({
      actionGroup: "add",
      actorUserId: "user-7",
      before: null,
      limit: 10,
      mapId: "map-3"
    });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        action: { in: ["MARKER_CREATED"] },
        actorUserId: "user-7",
        mapId: "map-3"
      }
    }));
  });

  it("inverts the cursor comparison when ordering oldest first", async () => {
    const dependencies = createAuditHistoryDependencies();
    const before = { createdAt: new Date("2026-05-10T04:00:00.000Z"), id: "event-9" };

    await dependencies.listEvents({ before, limit: 10, order: "asc" });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: {
        OR: [
          { createdAt: { gt: before.createdAt } },
          { createdAt: before.createdAt, id: { gt: before.id } }
        ]
      }
    }));
  });

  it("keeps the descending cursor comparison by default", async () => {
    const dependencies = createAuditHistoryDependencies();
    const before = { createdAt: new Date("2026-05-10T04:00:00.000Z"), id: "event-9" };

    await dependencies.listEvents({ before, limit: 10 });

    expect(mocks.auditEventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } }
        ]
      }
    }));
  });
});

describe("createAuditHistoryDependencies filter options", () => {
  beforeEach(() => {
    mocks.mapFindMany.mockClear();
    mocks.userFindMany.mockClear();
  });

  it("lists active maps ordered by name", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listMaps();

    expect(mocks.mapFindMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { isActive: true }
    });
  });

  it("lists users ordered by username", async () => {
    const dependencies = createAuditHistoryDependencies();

    await dependencies.listUsers();

    expect(mocks.userFindMany).toHaveBeenCalledWith({
      orderBy: { username: "asc" },
      select: { id: true, username: true }
    });
  });
});
