import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn()
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

import {
  listAuditHistory,
  listAuditHistoryFilterOptions,
  type AuditHistoryDependencies
} from "./audit-history";

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

describe("listAuditHistory", () => {
  it("returns a bounded admin audit history with actor and map labels", async () => {
    let requestedLimit = 0;
    const dependencies: AuditHistoryDependencies = {
      listEvents: async ({ limit }) => {
        requestedLimit = limit;
        return [
          {
            action: "MARKER_CREATED",
            actor: { username: "Mako" },
            actorUserId: "user-1",
            createdAt: new Date("2026-05-10T04:00:00.000Z"),
            id: "event-1",
            map: { name: "Wurm" },
            mapId: "map-1",
            metadata: {
              markerType: "tower",
              sessionToken: "secret",
              x: 100,
              y: 200
            },
            targetId: "tower-1",
            targetType: "TOWER"
          }
        ];
      },
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: adminActor, limit: 500 }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: {
        events: [
          {
            action: "MARKER_CREATED",
            actorUsername: "Mako",
            createdAt: "2026-05-10T04:00:00.000Z",
            id: "event-1",
            mapId: "map-1",
            mapName: "Wurm",
            metadata: {
              markerType: "tower",
              x: 100,
              y: 200
            },
            targetId: "tower-1",
            targetType: "TOWER",
            x: 100,
            y: 200
          }
        ],
        nextCursor: null
      }
    });
    expect(requestedLimit).toBe(101);
  });

  it("returns a cursor for older audit history pages", async () => {
    let requestedCursor: { createdAt: Date; id: string } | null = null;
    const dependencies: AuditHistoryDependencies = {
      listEvents: async ({ before, limit }) => {
        requestedCursor = before;

        if (limit !== 2) {
          return [];
        }

        return [
          {
            action: "LOGIN",
            actor: { username: "Mako" },
            actorUserId: "user-1",
            createdAt: new Date("2026-05-10T04:00:00.000Z"),
            id: "event-2",
            map: null,
            mapId: null,
            metadata: {},
            targetId: "session-1",
            targetType: "SESSION"
          },
          {
            action: "REGISTRATION",
            actor: { username: "Mako" },
            actorUserId: "user-1",
            createdAt: new Date("2026-05-10T03:00:00.000Z"),
            id: "event-1",
            map: null,
            mapId: null,
            metadata: {},
            targetId: "user-1",
            targetType: "USER"
          }
        ];
      },
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const firstPage = await listAuditHistory({ actor: adminActor, limit: 1 }, dependencies);

    expect(firstPage.ok).toBe(true);

    if (!firstPage.ok) {
      return;
    }

    expect(firstPage.value.events).toHaveLength(1);
    expect(firstPage.value.nextCursor).not.toBeNull();

    await listAuditHistory({
      actor: adminActor,
      before: firstPage.value.nextCursor ?? undefined,
      limit: 1
    }, dependencies);

    expect(requestedCursor).toEqual({
      createdAt: new Date("2026-05-10T04:00:00.000Z"),
      id: "event-2"
    });
  });

  it("rejects non-admin users and records the failed authorization", async () => {
    const auditEvents: unknown[] = [];
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async (event) => {
        auditEvents.push(event);
      }
    };

    const result = await listAuditHistory({ actor: writerActor, limit: 25 }, dependencies);

    expect(result).toEqual({
      ok: false,
      error: "Admin access is required"
    });
    expect(auditEvents).toEqual([
      {
        action: "FAILED_AUTHORIZATION",
        actorUserId: "writer-id",
        mapId: null,
        metadata: { attemptedAction: "AUDIT_LOG_VIEW" },
        targetId: null,
        targetType: "SYSTEM"
      }
    ]);
  });
});

describe("audit history alert detection triggers", () => {
  beforeEach(() => {
    mocks.triggerAlertDetection.mockReset();
  });

  it("triggers alert detection after a failed authorization", async () => {
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: writerActor, limit: 25 }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not trigger alert detection for an authorized history view", async () => {
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: adminActor, limit: 25 }, dependencies);

    expect(result.ok).toBe(true);
    expect(mocks.triggerAlertDetection).not.toHaveBeenCalled();
  });

  it("does not let a synchronous trigger failure break the request", async () => {
    mocks.triggerAlertDetection.mockImplementation(() => {
      throw new Error("alert pipeline exploded");
    });
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: writerActor, limit: 25 }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
  });
});

describe("listAuditHistory filters", () => {
  it("passes user, action group, map and order filters through to the dependency", async () => {
    let requested: Record<string, unknown> = {};
    const dependencies: AuditHistoryDependencies = {
      listEvents: async (input) => {
        requested = input as Record<string, unknown>;
        return [];
      },
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({
      actionGroup: "other",
      actor: adminActor,
      actorUserId: "user-7",
      mapId: "map-3",
      order: "asc"
    }, dependencies);

    expect(result.ok).toBe(true);
    expect(requested).toEqual({
      actionGroup: "other",
      actorUserId: "user-7",
      before: null,
      limit: 101,
      mapId: "map-3",
      order: "asc"
    });
  });

  it("paginates in ascending order using the same cursor shape", async () => {
    const cursors: Array<{ createdAt: Date; id: string } | null> = [];
    const dependencies: AuditHistoryDependencies = {
      listEvents: async ({ before, limit }) => {
        cursors.push(before);

        if (limit !== 2) {
          return [];
        }

        return [
          {
            action: "LOGIN",
            actor: { username: "Mako" },
            actorUserId: "user-1",
            createdAt: new Date("2026-05-10T03:00:00.000Z"),
            id: "event-1",
            map: null,
            mapId: null,
            metadata: {},
            targetId: "session-1",
            targetType: "SESSION"
          },
          {
            action: "LOGOUT",
            actor: { username: "Mako" },
            actorUserId: "user-1",
            createdAt: new Date("2026-05-10T04:00:00.000Z"),
            id: "event-2",
            map: null,
            mapId: null,
            metadata: {},
            targetId: "session-1",
            targetType: "SESSION"
          }
        ];
      },
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const firstPage = await listAuditHistory(
      { actor: adminActor, limit: 1, order: "asc" },
      dependencies
    );

    expect(firstPage.ok).toBe(true);

    if (!firstPage.ok) {
      return;
    }

    expect(firstPage.value.events).toHaveLength(1);
    expect(firstPage.value.events[0]?.createdAt).toBe("2026-05-10T03:00:00.000Z");
    expect(firstPage.value.nextCursor).not.toBeNull();

    await listAuditHistory({
      actor: adminActor,
      before: firstPage.value.nextCursor ?? undefined,
      limit: 1,
      order: "asc"
    }, dependencies);

    expect(cursors).toEqual([
      null,
      {
        createdAt: new Date("2026-05-10T03:00:00.000Z"),
        id: "event-1"
      }
    ]);
  });
});

describe("listAuditHistoryFilterOptions", () => {
  it("returns maps and users for the filter dropdowns", async () => {
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [
        { id: "map-1", name: "Celebration" },
        { id: "map-2", name: "Exodus" }
      ],
      listUsers: async () => [
        { id: "user-1", username: "Admin" },
        { id: "user-2", username: "Mako" }
      ],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistoryFilterOptions({ actor: adminActor }, dependencies);

    expect(result).toEqual({
      ok: true,
      value: {
        maps: [
          { id: "map-1", name: "Celebration" },
          { id: "map-2", name: "Exodus" }
        ],
        users: [
          { id: "user-1", username: "Admin" },
          { id: "user-2", username: "Mako" }
        ]
      }
    });
  });

  it("rejects non-admin users", async () => {
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
      listMaps: async () => [],
      listUsers: async () => [],
      recordAudit: async () => undefined
    };

    const result = await listAuditHistoryFilterOptions({ actor: writerActor }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
  });
});
