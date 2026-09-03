import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerAlertDetection: vi.fn()
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  triggerAlertDetection: mocks.triggerAlertDetection
}));

import { listAuditHistory, type AuditHistoryDependencies } from "./audit-history";

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
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: writerActor, limit: 25 }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
    expect(mocks.triggerAlertDetection).toHaveBeenCalledTimes(1);
  });

  it("does not trigger alert detection for an authorized history view", async () => {
    const dependencies: AuditHistoryDependencies = {
      listEvents: async () => [],
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
      recordAudit: async () => undefined
    };

    const result = await listAuditHistory({ actor: writerActor, limit: 25 }, dependencies);

    expect(result).toEqual({ ok: false, error: "Admin access is required" });
  });
});
