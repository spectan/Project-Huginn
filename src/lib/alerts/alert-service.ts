import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { err, ok, type Result } from "@/lib/domain/result";
import type {
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertWithActor,
  DetectAlertsInput
} from "./alert-types";

const ALERT_DEDUP_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;
const DELETE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const MAP_DATA_ACCESS_WINDOW_MS = 10 * 60 * 1000;
const NEW_IP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const TRIGGER_LOOKBACK_MS = 15 * 60 * 1000;

const OFF_HOURS_ADMIN_ACTIONS = new Set([
  "LOGIN",
  "MARKER_CREATED",
  "MARKER_UPDATED",
  "MARKER_DELETED",
  "USER_APPROVED",
  "USER_DELETED",
  "USER_PASSWORD_CHANGED",
  "PERMISSION_CHANGED"
]);

type ListAlertsOptions = {
  limit?: number;
  severity?: AlertSeverity;
  status?: AlertStatus;
};

type AuditEventWithActor = Prisma.AuditEventGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        isAdmin: true;
        username: true;
      };
    };
  };
}>;

export async function listAlerts(
  options: ListAlertsOptions = {}
): Promise<Result<AlertWithActor[]>> {
  const limit = clampLimit(options.limit);
  const where: Prisma.AlertWhereInput = {};

  if (options.status !== undefined) {
    where.status = options.status;
  }

  if (options.severity !== undefined) {
    where.severity = options.severity;
  }

  const alerts = await prisma.alert.findMany({
    include: {
      actor: {
        select: {
          username: true
        }
      },
      map: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: limit,
    where
  });

  return ok(alerts.map(serializeAlert));
}

export async function detectAlerts(
  input: DetectAlertsInput = {}
): Promise<Result<{ alerts: AlertWithActor[]; created: number }>> {
  const until = input.until ?? new Date();
  const since = input.since ?? new Date(until.getTime() - DEFAULT_LOOKBACK_MS);

  const events = await prisma.auditEvent.findMany({
    include: {
      actor: {
        select: {
          id: true,
          isAdmin: true,
          username: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    where: {
      createdAt: {
        gte: since,
        lte: until
      }
    }
  });

  const createdAlerts: AlertWithActor[] = [];

  const ruleResults = await Promise.all([
    detectDeleteSpikes(events, getWindowStart(since, until, DELETE_WINDOW_MS)),
    detectMapDataAccessSpikes(events, getWindowStart(since, until, MAP_DATA_ACCESS_WINDOW_MS)),
    detectNewIpLogins(events),
    detectOffHoursAdminActivity(events),
    detectRegistrationSpikes(events, getWindowStart(since, until, REGISTRATION_WINDOW_MS)),
    detectRepeatedAuthFailures(events, getWindowStart(since, until, AUTH_FAILURE_WINDOW_MS))
  ]);

  for (const alerts of ruleResults) {
    createdAlerts.push(...alerts);
  }

  return ok({
    alerts: createdAlerts,
    created: createdAlerts.length
  });
}

export function triggerAlertDetection(): void {
  detectAlerts({ since: new Date(Date.now() - TRIGGER_LOOKBACK_MS) }).catch(() => undefined);
}

export async function deleteAlert(alertId: string): Promise<Result<null>> {
  const existing = await prisma.alert.findUnique({
    where: {
      id: alertId
    }
  });

  if (existing === null) {
    return err("Alert was not found");
  }

  await prisma.alert.delete({
    where: {
      id: alertId
    }
  });

  return ok(null);
}

export async function sendWebhook(alert: AlertWithActor): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;

  if (url === undefined || url.length === 0) {
    return;
  }

  if (alert.severity !== "HIGH") {
    return;
  }

  await fetch(url, {
    body: JSON.stringify({
      actorUsername: alert.actorUsername,
      createdAt: alert.createdAt.toISOString(),
      description: alert.description,
      id: alert.id,
      metadata: alert.metadata,
      rule: alert.rule,
      severity: alert.severity,
      status: alert.status,
      title: alert.title
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

async function detectDeleteSpikes(
  events: AuditEventWithActor[],
  windowStart: Date
): Promise<AlertWithActor[]> {
  const deleteEvents = events.filter(
    (event) =>
      event.actorUserId !== null &&
      event.createdAt >= windowStart &&
      event.action === "MARKER_DELETED"
  );

  const countsByUser = groupByUser(deleteEvents);
  const results: AlertWithActor[] = [];

  for (const [userId, count] of countsByUser.entries()) {
    let severity: AlertSeverity | null = null;

    if (count >= 50) {
      severity = "HIGH";
    } else if (count >= 20) {
      severity = "MEDIUM";
    }

    if (severity === null) {
      continue;
    }

    const event = deleteEvents.find((e) => e.actorUserId === userId);
    const user = event?.actor ?? null;
    const alert = await createAlert({
      actorUserId: userId,
      description: `${count} markers deleted in the last 15 minutes`,
      mapId: event?.mapId ?? null,
      metadata: {
        count,
        windowMinutes: 15
      },
      rule: "DELETE_SPIKE",
      severity,
      title: `High marker deletion rate for ${user?.username ?? "unknown user"}`
    });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function detectMapDataAccessSpikes(
  events: AuditEventWithActor[],
  windowStart: Date
): Promise<AlertWithActor[]> {
  const accessEvents = events.filter(
    (event) =>
      event.actorUserId !== null &&
      event.createdAt >= windowStart &&
      event.action === "MAP_DATA_ACCESSED"
  );

  const countsByUser = groupByUser(accessEvents);
  const results: AlertWithActor[] = [];

  for (const [userId, count] of countsByUser.entries()) {
    let severity: AlertSeverity | null = null;

    if (count >= 15) {
      severity = "HIGH";
    } else if (count >= 5) {
      severity = "MEDIUM";
    }

    if (severity === null) {
      continue;
    }

    const event = accessEvents.find((e) => e.actorUserId === userId);
    const user = event?.actor ?? null;
    const alert = await createAlert({
      actorUserId: userId,
      description: `${count} map data access events in the last 10 minutes`,
      mapId: event?.mapId ?? null,
      metadata: {
        count,
        windowMinutes: 10
      },
      rule: "MAP_DATA_ACCESS_SPIKE",
      severity,
      title: `Bulk map data access for ${user?.username ?? "unknown user"}`
    });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function detectNewIpLogins(
  events: AuditEventWithActor[]
): Promise<AlertWithActor[]> {
  const loginEvents = events.filter(
    (event) => event.action === "LOGIN" && event.actor !== null
  );

  const results: AlertWithActor[] = [];

  for (const event of loginEvents) {
    const actor = event.actor;

    if (actor === null) {
      continue;
    }

    const clientIp = extractClientIp(event.metadata);

    if (clientIp === null || event.actorUserId === null) {
      continue;
    }

    const hasPriorLogin = await findPriorLoginFromIp(
      event.actorUserId,
      clientIp,
      event.createdAt
    );

    if (hasPriorLogin) {
      continue;
    }

    const alert = actor.isAdmin
      ? await createAlert({
          actorUserId: event.actorUserId,
          description: `Admin ${actor.username} logged in from a new IP address (${clientIp})`,
          mapId: event.mapId ?? null,
          metadata: {
            clientIp,
            username: actor.username
          },
          rule: "NEW_ADMIN_IP",
          severity: "HIGH",
          title: `New admin login IP for ${actor.username}`
        })
      : await createAlert({
          actorUserId: event.actorUserId,
          description: `${actor.username} logged in from a new IP address (${clientIp})`,
          mapId: event.mapId ?? null,
          metadata: {
            clientIp
          },
          rule: "NEW_IP_LOGIN",
          severity: "LOW",
          title: `New IP login for ${actor.username}`
        });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function findPriorLoginFromIp(
  actorUserId: string,
  clientIp: string,
  before: Date
): Promise<boolean> {
  const lookbackStart = new Date(Date.now() - NEW_IP_LOOKBACK_MS);
  const priorLogin = await prisma.auditEvent.findFirst({
    where: {
      action: "LOGIN",
      actorUserId,
      createdAt: {
        gte: lookbackStart,
        lt: before
      },
      metadata: {
        path: ["clientIp"],
        equals: clientIp
      }
    }
  });

  return priorLogin !== null;
}

async function detectOffHoursAdminActivity(
  events: AuditEventWithActor[]
): Promise<AlertWithActor[]> {
  const results: AlertWithActor[] = [];

  for (const event of events) {
    const actor = event.actor;

    if (actor === null || !actor.isAdmin) {
      continue;
    }

    if (!OFF_HOURS_ADMIN_ACTIONS.has(event.action)) {
      continue;
    }

    const hour = event.createdAt.getUTCHours();

    if (hour !== 23 && hour >= 6) {
      continue;
    }

    const alert = await createAlert({
      actorUserId: event.actorUserId,
      description: `Admin ${actor.username} performed ${event.action} at ${event.createdAt.toISOString()} UTC`,
      mapId: event.mapId ?? null,
      metadata: {
        action: event.action,
        hour
      },
      rule: "OFF_HOURS_ADMIN_ACTIVITY",
      severity: "LOW",
      title: `Off-hours admin activity by ${actor.username}`
    });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function detectRegistrationSpikes(
  events: AuditEventWithActor[],
  windowStart: Date
): Promise<AlertWithActor[]> {
  const registrationEvents = events.filter(
    (event) => event.action === "REGISTRATION" && event.createdAt >= windowStart
  );

  const countsByIp = new Map<string, number>();

  for (const event of registrationEvents) {
    const ip = extractClientIp(event.metadata);

    if (ip === null) {
      continue;
    }

    countsByIp.set(ip, (countsByIp.get(ip) ?? 0) + 1);
  }

  const results: AlertWithActor[] = [];

  for (const [ip, count] of countsByIp.entries()) {
    if (count < 3) {
      continue;
    }

    const alert = await createAlert({
      actorUserId: null,
      description: `${count} registrations from ${ip} in the last 60 minutes`,
      mapId: null,
      metadata: {
        count,
        windowMinutes: 60
      },
      rule: "REGISTRATION_SPIKE",
      severity: "MEDIUM",
      title: `Multiple registrations from ${ip}`
    });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function detectRepeatedAuthFailures(
  events: AuditEventWithActor[],
  windowStart: Date
): Promise<AlertWithActor[]> {
  const failureEvents = events.filter(
    (event) =>
      (event.action === "FAILED_LOGIN" || event.action === "FAILED_AUTHORIZATION") &&
      event.createdAt >= windowStart
  );

  const countsByIp = new Map<string, number>();

  for (const event of failureEvents) {
    const ip = extractClientIp(event.metadata);

    if (ip === null) {
      continue;
    }

    countsByIp.set(ip, (countsByIp.get(ip) ?? 0) + 1);
  }

  const results: AlertWithActor[] = [];

  for (const [ip, count] of countsByIp.entries()) {
    let severity: AlertSeverity | null = null;

    if (count >= 15) {
      severity = "HIGH";
    } else if (count >= 5) {
      severity = "MEDIUM";
    }

    if (severity === null) {
      continue;
    }

    const alert = await createAlert({
      actorUserId: null,
      description: `${count} failed login/authorization attempts from ${ip} in the last 5 minutes`,
      mapId: null,
      metadata: {
        clientIp: ip,
        count,
        windowMinutes: 5
      },
      rule: "REPEATED_AUTH_FAILURES",
      severity,
      title: `Repeated authentication failures from ${ip}`
    });

    if (alert !== null) {
      results.push(alert);
    }
  }

  return results;
}

async function createAlert(input: {
  actorUserId: string | null;
  description: string;
  mapId: string | null;
  metadata: Record<string, unknown>;
  rule: AlertRule;
  severity: AlertSeverity;
  title: string;
}): Promise<AlertWithActor | null> {
  const oneHourAgo = new Date(Date.now() - ALERT_DEDUP_WINDOW_MS);
  const existing = await prisma.alert.findFirst({
    where: {
      actorUserId: input.actorUserId,
      createdAt: {
        gte: oneHourAgo
      },
      mapId: input.mapId,
      rule: input.rule,
      status: "OPEN"
    }
  });

  if (existing !== null) {
    return null;
  }

  const alert = await prisma.alert.create({
    data: {
      actorUserId: input.actorUserId,
      description: input.description,
      mapId: input.mapId,
      metadata: input.metadata as Prisma.InputJsonValue,
      rule: input.rule,
      severity: input.severity,
      status: "OPEN",
      title: input.title
    },
    include: {
      actor: {
        select: {
          username: true
        }
      },
      map: {
        select: {
          name: true
        }
      }
    }
  });

  const serialized = serializeAlert(alert);

  if (serialized.severity === "HIGH") {
    await sendWebhook(serialized).catch(() => undefined);
  }

  return serialized;
}

function getWindowStart(since: Date, until: Date, windowMs: number): Date {
  return new Date(Math.max(since.getTime(), until.getTime() - windowMs));
}

function groupByUser(events: AuditEventWithActor[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.actorUserId === null) {
      continue;
    }

    counts.set(event.actorUserId, (counts.get(event.actorUserId) ?? 0) + 1);
  }

  return counts;
}

function extractClientIp(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }

  const clientIp = (metadata as Record<string, unknown>).clientIp;

  if (typeof clientIp !== "string" || clientIp.length === 0) {
    return null;
  }

  return clientIp;
}

function serializeAlert(
  alert: Prisma.AlertGetPayload<{
    include: {
      actor: {
        select: {
          username: true;
        };
      };
      map: {
        select: {
          name: true;
        };
      };
    };
  }>
): AlertWithActor {
  return {
    ...alert,
    actorUsername: alert.actor?.username ?? null,
    mapName: alert.map?.name ?? null,
    rule: alert.rule as AlertRule
  };
}

function clampLimit(limit: number | undefined, max = 500): number {
  if (limit === undefined || !Number.isInteger(limit)) {
    return 100;
  }

  return Math.min(Math.max(limit, 1), max);
}
