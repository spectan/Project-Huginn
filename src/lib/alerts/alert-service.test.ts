import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestActor = {
  id: string;
  isAdmin: boolean;
  username: string;
};

type TestAuditEvent = {
  action: string;
  actor: TestActor | null;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
  mapId: string | null;
  metadata: unknown;
  targetId: string | null;
  targetType: string;
};

type TestAlert = {
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  actor: { username: string } | null;
  actorUserId: string | null;
  createdAt: Date;
  description: string;
  id: string;
  map: { name: string } | null;
  mapId: string | null;
  metadata: unknown;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  rule: string;
  severity: string;
  status: string;
  title: string;
  updatedAt: Date;
};

type AuditFindManyArgs = {
  where: {
    createdAt: { gte: Date; lte: Date };
  };
};

type AuditFindFirstArgs = {
  where: {
    action: string;
    actorUserId: string;
    createdAt: { gte: Date; lt: Date };
    metadata: { path: string[]; equals: string };
  };
};

type AlertFindFirstArgs = {
  where: {
    actorUserId: string | null;
    createdAt: { gte: Date };
    mapId: string | null;
    rule: string;
    status: string;
  };
};

type AlertCreateArgs = {
  data: {
    actorUserId: string | null;
    description: string;
    mapId: string | null;
    metadata: unknown;
    rule: string;
    severity: string;
    status: string;
    title: string;
  };
};

const mocks = vi.hoisted(() => {
  function metadataClientIp(metadata: unknown): string | null {
    if (typeof metadata !== "object" || metadata === null) {
      return null;
    }

    const clientIp = (metadata as Record<string, unknown>).clientIp;
    return typeof clientIp === "string" && clientIp.length > 0 ? clientIp : null;
  }

  const state = {
    alerts: [] as TestAlert[],
    auditEvents: [] as TestAuditEvent[],
    failAuditFindMany: false,
    nextAlertId: 1,
    nextEventId: 1,
    usernames: new Map<string, string>()
  };

  const auditEventFindMany = vi.fn(async (args: AuditFindManyArgs) => {
    if (state.failAuditFindMany) {
      throw new Error("database unavailable");
    }

    return state.auditEvents.filter(
      (event) =>
        event.createdAt >= args.where.createdAt.gte &&
        event.createdAt <= args.where.createdAt.lte
    );
  });

  const auditEventFindFirst = vi.fn(async (args: AuditFindFirstArgs) => {
    return state.auditEvents.find(
      (event) =>
        event.action === args.where.action &&
        event.actorUserId === args.where.actorUserId &&
        event.createdAt >= args.where.createdAt.gte &&
        event.createdAt < args.where.createdAt.lt &&
        metadataClientIp(event.metadata) === args.where.metadata.equals
    ) ?? null;
  });

  const alertFindFirst = vi.fn(async (args: AlertFindFirstArgs) => {
    return state.alerts.find(
      (alert) =>
        alert.actorUserId === args.where.actorUserId &&
        alert.mapId === args.where.mapId &&
        alert.rule === args.where.rule &&
        alert.status === args.where.status &&
        alert.createdAt >= args.where.createdAt.gte
    ) ?? null;
  });

  const alertCreate = vi.fn(async (args: AlertCreateArgs) => {
    const now = new Date();
    const actorUserId = args.data.actorUserId;
    const alert: TestAlert = {
      acknowledgedAt: null,
      acknowledgedByUserId: null,
      actor: actorUserId === null
        ? null
        : { username: state.usernames.get(actorUserId) ?? "unknown" },
      actorUserId,
      createdAt: now,
      description: args.data.description,
      id: `alert-${state.nextAlertId++}`,
      map: null,
      mapId: args.data.mapId,
      metadata: args.data.metadata,
      resolvedAt: null,
      resolvedByUserId: null,
      rule: args.data.rule,
      severity: args.data.severity,
      status: args.data.status,
      title: args.data.title,
      updatedAt: now
    };
    state.alerts.push(alert);
    return alert;
  });

  const alertDelete = vi.fn(async (args: { where: { id: string } }) => {
    const index = state.alerts.findIndex((alert) => alert.id === args.where.id);
    const [removed] = state.alerts.splice(index, 1);
    return removed ?? null;
  });

  const alertFindUnique = vi.fn(async (args: { where: { id: string } }) => {
    return state.alerts.find((alert) => alert.id === args.where.id) ?? null;
  });

  return {
    alertCreate,
    alertDelete,
    alertFindFirst,
    alertFindUnique,
    auditEventFindFirst,
    auditEventFindMany,
    state
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alert: {
      create: mocks.alertCreate,
      delete: mocks.alertDelete,
      findFirst: mocks.alertFindFirst,
      findUnique: mocks.alertFindUnique
    },
    auditEvent: {
      findFirst: mocks.auditEventFindFirst,
      findMany: mocks.auditEventFindMany
    }
  }
}));

import { deleteAlert, detectAlerts, triggerAlertDetection } from "./alert-service";

const userActor: TestActor = { id: "user-1", isAdmin: false, username: "alice" };
const adminActor: TestActor = { id: "admin-1", isAdmin: true, username: "root" };

function addEvent(input: {
  action: string;
  actor?: TestActor | null;
  createdAt?: Date;
  mapId?: string | null;
  metadata?: unknown;
}): TestAuditEvent {
  const actor = input.actor === undefined ? userActor : input.actor;
  const event: TestAuditEvent = {
    action: input.action,
    actor,
    actorUserId: actor?.id ?? null,
    createdAt: input.createdAt ?? new Date(Date.now() - 30_000),
    id: `event-${mocks.state.nextEventId++}`,
    mapId: input.mapId === undefined ? "map-1" : input.mapId,
    metadata: input.metadata ?? {},
    targetId: null,
    targetType: "SYSTEM"
  };
  mocks.state.auditEvents.push(event);
  return event;
}

function addEvents(count: number, input: Parameters<typeof addEvent>[0]): void {
  for (let index = 0; index < count; index += 1) {
    addEvent(input);
  }
}

function dateAtUtcHour(hour: number, reference: Date): Date {
  const date = new Date(reference);
  date.setUTCHours(hour, 0, 0, 0);

  if (date.getTime() > reference.getTime()) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}

function seededAlert(overrides: Partial<TestAlert>): TestAlert {
  const now = new Date();
  return {
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    actor: { username: userActor.username },
    actorUserId: userActor.id,
    createdAt: now,
    description: "Seeded alert",
    id: `alert-${mocks.state.nextAlertId++}`,
    map: null,
    mapId: "map-1",
    metadata: {},
    resolvedAt: null,
    resolvedByUserId: null,
    rule: "DELETE_SPIKE",
    severity: "MEDIUM",
    status: "OPEN",
    title: "Seeded alert",
    updatedAt: now,
    ...overrides
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("detectAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.alerts = [];
    mocks.state.auditEvents = [];
    mocks.state.failAuditFindMany = false;
    mocks.state.usernames = new Map([
      [userActor.id, userActor.username],
      [adminActor.id, adminActor.username]
    ]);
  });

  describe("DELETE_SPIKE", () => {
    it("creates a MEDIUM alert at the 20 deletion threshold", async () => {
      addEvents(20, { action: "MARKER_DELETED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
      expect(alerts[0]?.title).toBe("High marker deletion rate for alice");
      expect(alerts[0]?.metadata).toEqual({ count: 20, windowMinutes: 15 });
    });

    it("creates a HIGH alert at the 50 deletion threshold", async () => {
      addEvents(50, { action: "MARKER_DELETED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("HIGH");
    });

    it("does not alert below the deletion threshold", async () => {
      addEvents(19, { action: "MARKER_DELETED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE")).toHaveLength(0);
    });
  });

  describe("MAP_DATA_ACCESS_SPIKE", () => {
    it("creates a MEDIUM alert at the 5 access threshold", async () => {
      addEvents(5, { action: "MAP_DATA_ACCESSED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "MAP_DATA_ACCESS_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
      expect(alerts[0]?.title).toBe("Bulk map data access for alice");
      expect(alerts[0]?.metadata).toEqual({ count: 5, windowMinutes: 10 });
    });

    it("creates a HIGH alert at the 15 access threshold", async () => {
      addEvents(15, { action: "MAP_DATA_ACCESSED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "MAP_DATA_ACCESS_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("HIGH");
      expect(alerts[0]?.metadata).toEqual({ count: 15, windowMinutes: 10 });
    });

    it("does not alert below the access threshold", async () => {
      addEvents(4, { action: "MAP_DATA_ACCESSED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "MAP_DATA_ACCESS_SPIKE")).toHaveLength(0);
    });
  });

  describe("NEW_ADMIN_IP", () => {
    it("flags an admin login from a previously unseen IP", async () => {
      addEvent({
        action: "LOGIN",
        actor: adminActor,
        metadata: { clientIp: "198.51.100.7" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "NEW_ADMIN_IP");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("HIGH");
      expect(alerts[0]?.title).toBe("New admin login IP for root");
      expect(alerts[0]?.metadata).toEqual({
        clientIp: "198.51.100.7",
        username: "root"
      });
    });

    it("ignores an admin login from a previously seen IP", async () => {
      addEvent({
        action: "LOGIN",
        actor: adminActor,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        metadata: { clientIp: "198.51.100.7" }
      });
      addEvent({
        action: "LOGIN",
        actor: adminActor,
        metadata: { clientIp: "198.51.100.7" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_ADMIN_IP")).toHaveLength(0);
    });

    it("ignores logins from non-admin users", async () => {
      addEvent({
        action: "LOGIN",
        actor: userActor,
        metadata: { clientIp: "198.51.100.8" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_ADMIN_IP")).toHaveLength(0);
    });

    it("ignores admin logins without a client IP", async () => {
      addEvent({ action: "LOGIN", actor: adminActor });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_ADMIN_IP")).toHaveLength(0);
    });
  });

  describe("NEW_IP_LOGIN", () => {
    it("flags a first-seen IP for a non-admin user with LOW severity", async () => {
      addEvent({
        action: "LOGIN",
        actor: userActor,
        metadata: { clientIp: "198.51.100.8" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "NEW_IP_LOGIN");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("LOW");
      expect(alerts[0]?.title).toBe("New IP login for alice");
      expect(alerts[0]?.metadata).toEqual({ clientIp: "198.51.100.8" });
    });

    it("ignores a login from a previously seen IP", async () => {
      addEvent({
        action: "LOGIN",
        actor: userActor,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        metadata: { clientIp: "198.51.100.8" }
      });
      addEvent({
        action: "LOGIN",
        actor: userActor,
        metadata: { clientIp: "198.51.100.8" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_IP_LOGIN")).toHaveLength(0);
    });

    it("does not flag admin logins, which produce NEW_ADMIN_IP instead", async () => {
      addEvent({
        action: "LOGIN",
        actor: adminActor,
        metadata: { clientIp: "198.51.100.7" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_IP_LOGIN")).toHaveLength(0);
      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_ADMIN_IP")).toHaveLength(1);
    });

    it("ignores logins without a client IP", async () => {
      addEvent({ action: "LOGIN", actor: userActor });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "NEW_IP_LOGIN")).toHaveLength(0);
    });
  });

  describe("OFF_HOURS_ADMIN_ACTIVITY", () => {
    it("flags admin activity during off hours", async () => {
      const until = new Date();
      addEvent({
        action: "MARKER_DELETED",
        actor: adminActor,
        createdAt: dateAtUtcHour(3, until)
      });

      const result = await detectAlerts({
        since: new Date(until.getTime() - 24 * 60 * 60 * 1000),
        until
      });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "OFF_HOURS_ADMIN_ACTIVITY");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("LOW");
      expect(alerts[0]?.title).toBe("Off-hours admin activity by root");
      expect(alerts[0]?.metadata).toEqual({ action: "MARKER_DELETED", hour: 3 });
    });

    it("flags the extended admin action set during off hours", async () => {
      const until = new Date();
      const actions = ["USER_APPROVED", "USER_DELETED", "USER_PASSWORD_CHANGED", "PERMISSION_CHANGED"];

      // Distinct mapIds keep the one-hour dedup (rule + actor + map) from
      // collapsing the four events into a single alert.
      for (const action of actions) {
        addEvent({
          action,
          actor: adminActor,
          createdAt: dateAtUtcHour(23, until),
          mapId: `map-${action}`
        });
      }

      const result = await detectAlerts({
        since: new Date(until.getTime() - 24 * 60 * 60 * 1000),
        until
      });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "OFF_HOURS_ADMIN_ACTIVITY");
      expect(alerts).toHaveLength(4);
    });

    it("ignores admin activity during business hours", async () => {
      const until = new Date();
      addEvent({
        action: "MARKER_DELETED",
        actor: adminActor,
        createdAt: dateAtUtcHour(12, until)
      });

      const result = await detectAlerts({
        since: new Date(until.getTime() - 24 * 60 * 60 * 1000),
        until
      });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "OFF_HOURS_ADMIN_ACTIVITY")).toHaveLength(0);
    });

    it("ignores off-hours activity from non-admin users", async () => {
      const until = new Date();
      addEvent({
        action: "MARKER_DELETED",
        actor: userActor,
        createdAt: dateAtUtcHour(3, until)
      });

      const result = await detectAlerts({
        since: new Date(until.getTime() - 24 * 60 * 60 * 1000),
        until
      });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "OFF_HOURS_ADMIN_ACTIVITY")).toHaveLength(0);
    });
  });

  describe("REGISTRATION_SPIKE", () => {
    it("creates a MEDIUM alert at 3 registrations from one IP", async () => {
      addEvents(3, {
        action: "REGISTRATION",
        metadata: { clientIp: "203.0.113.20" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
      expect(alerts[0]?.title).toBe("Multiple registrations from 203.0.113.20");
      expect(alerts[0]?.metadata).toEqual({ count: 3, windowMinutes: 60 });
    });

    it("does not alert below the 3 registration threshold", async () => {
      addEvents(2, {
        action: "REGISTRATION",
        metadata: { clientIp: "203.0.113.20" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(0);
    });

    it("ignores registrations without a client IP and splits counts per IP", async () => {
      addEvents(3, { action: "REGISTRATION" });
      addEvents(2, {
        action: "REGISTRATION",
        metadata: { clientIp: "203.0.113.21" }
      });
      addEvents(2, {
        action: "REGISTRATION",
        metadata: { clientIp: "203.0.113.22" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(0);
    });

    it("deduplicates repeat detections for the same IP within one hour", async () => {
      addEvents(3, {
        action: "REGISTRATION",
        metadata: { clientIp: "203.0.113.20" }
      });

      const first = await detectAlerts();
      const second = await detectAlerts();

      expect(first.ok && second.ok).toBe(true);

      if (!first.ok || !second.ok) {
        return;
      }

      expect(first.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(1);
      expect(second.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(0);
      expect(mocks.state.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(1);
    });

    it("ignores registrations older than the 60 minute window", async () => {
      const until = new Date();
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      addEvents(3, {
        action: "REGISTRATION",
        createdAt: new Date(until.getTime() - 90 * 60 * 1000),
        metadata: { clientIp: "203.0.113.20" }
      });

      const result = await detectAlerts({ since, until });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "REGISTRATION_SPIKE")).toHaveLength(0);
    });
  });

  describe("REPEATED_AUTH_FAILURES", () => {
    it("creates a MEDIUM alert at 5 failures from one IP", async () => {
      addEvents(5, {
        action: "FAILED_LOGIN",
        actor: null,
        mapId: null,
        metadata: { clientIp: "203.0.113.9" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "REPEATED_AUTH_FAILURES");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
      expect(alerts[0]?.title).toBe("Repeated authentication failures from 203.0.113.9");
      expect(alerts[0]?.metadata).toEqual({
        clientIp: "203.0.113.9",
        count: 5,
        windowMinutes: 5
      });
    });

    it("creates a HIGH alert at 15 failures from one IP", async () => {
      addEvents(15, {
        action: "FAILED_LOGIN",
        actor: null,
        mapId: null,
        metadata: { clientIp: "203.0.113.9" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "REPEATED_AUTH_FAILURES");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("HIGH");
    });

    it("counts FAILED_AUTHORIZATION events that carry a clientIp", async () => {
      addEvents(5, {
        action: "FAILED_AUTHORIZATION",
        mapId: null,
        metadata: { clientIp: "203.0.113.11" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "REPEATED_AUTH_FAILURES");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
    });

    it("ignores failures without a client IP and splits counts per IP", async () => {
      addEvents(5, { action: "FAILED_LOGIN", actor: null, mapId: null });
      addEvents(4, {
        action: "FAILED_LOGIN",
        actor: null,
        mapId: null,
        metadata: { clientIp: "203.0.113.12" }
      });
      addEvents(4, {
        action: "FAILED_LOGIN",
        actor: null,
        mapId: null,
        metadata: { clientIp: "203.0.113.13" }
      });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "REPEATED_AUTH_FAILURES")).toHaveLength(0);
    });
  });

  describe("deduplication", () => {
    it("suppresses duplicate alerts for the same rule and actor within one hour", async () => {
      addEvents(20, { action: "MARKER_DELETED" });

      const first = await detectAlerts();
      const second = await detectAlerts();

      expect(first.ok && second.ok).toBe(true);

      if (!first.ok || !second.ok) {
        return;
      }

      expect(first.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE")).toHaveLength(1);
      expect(second.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE")).toHaveLength(0);
      expect(mocks.state.alerts).toHaveLength(1);
    });

    it("allows a new alert once the previous one is older than one hour", async () => {
      mocks.state.alerts.push(seededAlert({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      }));
      addEvents(20, { action: "MARKER_DELETED" });

      const result = await detectAlerts();

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE")).toHaveLength(1);
      expect(mocks.state.alerts).toHaveLength(2);
    });
  });

  describe("burst window evaluation", () => {
    it("evaluates deletions inside a custom since range older than the burst window", async () => {
      const until = new Date(Date.now() - 60 * 60 * 1000);
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      addEvents(20, {
        action: "MARKER_DELETED",
        createdAt: new Date(until.getTime() - 5 * 60 * 1000)
      });

      const result = await detectAlerts({ since, until });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
    });

    it("evaluates auth failures inside a custom since range older than the burst window", async () => {
      const until = new Date(Date.now() - 30 * 60 * 1000);
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      addEvents(5, {
        action: "FAILED_LOGIN",
        actor: null,
        createdAt: new Date(until.getTime() - 60 * 1000),
        mapId: null,
        metadata: { clientIp: "203.0.113.10" }
      });

      const result = await detectAlerts({ since, until });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      const alerts = result.value.alerts.filter((alert) => alert.rule === "REPEATED_AUTH_FAILURES");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("MEDIUM");
    });

    it("ignores burst events older than the window even when since allows them", async () => {
      const until = new Date();
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      addEvents(20, {
        action: "MARKER_DELETED",
        createdAt: new Date(until.getTime() - 30 * 60 * 1000)
      });

      const result = await detectAlerts({ since, until });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(result.value.alerts.filter((alert) => alert.rule === "DELETE_SPIKE")).toHaveLength(0);
    });
  });

  describe("webhook delivery", () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response("ok")
    );

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
      process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alerts";
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.ALERT_WEBHOOK_URL;
    });

    it("posts HIGH alerts to the configured webhook", async () => {
      addEvents(50, { action: "MARKER_DELETED" });

      await detectAlerts();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe("https://hooks.example.com/alerts");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body).toMatchObject({
        actorUsername: "alice",
        rule: "DELETE_SPIKE",
        severity: "HIGH",
        status: "OPEN"
      });
    });

    it("does not post MEDIUM alerts", async () => {
      addEvents(20, { action: "MARKER_DELETED" });

      await detectAlerts();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does nothing when ALERT_WEBHOOK_URL is not configured", async () => {
      delete process.env.ALERT_WEBHOOK_URL;
      addEvents(50, { action: "MARKER_DELETED" });

      await detectAlerts();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("triggerAlertDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.alerts = [];
    mocks.state.auditEvents = [];
    mocks.state.failAuditFindMany = false;
    mocks.state.usernames = new Map([[userActor.id, userActor.username]]);
  });

  it("kicks off detection over the last 15 minutes without throwing", async () => {
    expect(() => triggerAlertDetection()).not.toThrow();

    await flushMicrotasks();

    expect(mocks.auditEventFindMany).toHaveBeenCalledTimes(1);

    const args = mocks.auditEventFindMany.mock.calls[0]?.[0];
    const gte = args?.where.createdAt.gte;
    expect(gte).toBeInstanceOf(Date);

    if (gte instanceof Date) {
      const ageMs = Date.now() - gte.getTime();
      expect(ageMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 5000);
      expect(ageMs).toBeLessThan(15 * 60 * 1000 + 5000);
    }
  });

  it("swallows detection failures instead of rejecting", async () => {
    mocks.state.failAuditFindMany = true;

    expect(() => triggerAlertDetection()).not.toThrow();

    // An unhandled rejection here would fail the whole test run.
    await flushMicrotasks();
  });
});


describe("deleteAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.alerts = [];
  });

  it("hard-deletes an existing alert", async () => {
    mocks.state.alerts.push(seededAlert({ id: "alert-x" }));

    const result = await deleteAlert("alert-x");

    expect(result).toEqual({ ok: true, value: null });
    expect(mocks.alertDelete).toHaveBeenCalledWith({ where: { id: "alert-x" } });
    expect(mocks.state.alerts).toHaveLength(0);
  });

  it("returns an error when the alert does not exist", async () => {
    const result = await deleteAlert("alert-missing");

    expect(result).toEqual({ ok: false, error: "Alert was not found" });
    expect(mocks.alertDelete).not.toHaveBeenCalled();
  });
});
