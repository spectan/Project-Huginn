import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPrismaErrorCode } from "@/lib/db/prisma-errors";
import { dispatchDiscordSafely } from "@/lib/discord/dispatch-safely";
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
const NEW_IP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const TRIGGER_LOOKBACK_MS = 15 * 60 * 1000;
const WEBHOOK_TIMEOUT_MS = 5000;
/**
 * Upper bound on audit events loaded per detection run. The most recent
 * events win; older ones in an oversized range are ignored.
 */
const MAX_DETECTION_EVENTS = 10_000;

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2
};

const ALERT_INCLUDE = {
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
} as const;

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
    include: ALERT_INCLUDE,
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

  const newestEvents = await prisma.auditEvent.findMany({
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
      createdAt: "desc"
    },
    take: MAX_DETECTION_EVENTS,
    where: {
      createdAt: {
        gte: since,
        lte: until
      }
    }
  });
  const events = [...newestEvents].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  );

  const createdAlerts: AlertWithActor[] = [];

  // Rules run one after another: each alert write is a short locked
  // transaction, and running them concurrently would hold several pooled
  // connections per detection run.
  createdAlerts.push(...(await detectSpikes(events, since, until, DELETE_SPIKE)));
  createdAlerts.push(...(await detectSpikes(events, since, until, MAP_DATA_ACCESS_SPIKE)));
  createdAlerts.push(...(await detectNewIpLogins(events)));
  createdAlerts.push(...(await detectOffHoursAdminActivity(events)));
  createdAlerts.push(...(await detectSpikes(events, since, until, REGISTRATION_SPIKE)));
  createdAlerts.push(...(await detectSpikes(events, since, until, REPEATED_AUTH_FAILURES)));

  return ok({
    alerts: createdAlerts,
    created: createdAlerts.length
  });
}

// In-process coalescing: triggerAlertDetection fires on every mutation and
// map load. At most one detection run is in flight; triggers arriving during
// a run collapse into a single follow-up run.
let detectionRunning = false;
let detectionRerunRequested = false;

export function triggerAlertDetection(): void {
  if (detectionRunning) {
    detectionRerunRequested = true;
    return;
  }

  detectionRunning = true;
  void runCoalescedDetection();
}

async function runCoalescedDetection(): Promise<void> {
  try {
    do {
      detectionRerunRequested = false;
      await detectAlerts({ since: new Date(Date.now() - TRIGGER_LOOKBACK_MS) }).catch(() => undefined);
    } while (detectionRerunRequested);
  } finally {
    detectionRunning = false;
  }
}

export async function deleteAlert(alertId: string, actorUserId: string): Promise<Result<null>> {
  try {
    await prisma.$transaction(async (transaction) => {
      const deleted = await transaction.alert.delete({
        select: {
          actorUserId: true,
          mapId: true,
          metadata: true,
          rule: true,
          severity: true
        },
        where: {
          id: alertId
        }
      });
      // The dedup key lets detection recognise the deletion as "handled" so
      // the same alert is not re-created (and re-notified) within the window.
      const dedupKey = buildDedupKey({
        actorUserId: deleted.actorUserId,
        clientIp: deleted.actorUserId === null ? extractClientIp(deleted.metadata) : null,
        mapId: deleted.mapId,
        rule: deleted.rule
      });
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dedupKey}))`;
      await transaction.auditEvent.create({
        data: {
          action: "ALERT_DELETED",
          actorUserId,
          metadata: {
            dedupKey,
            rule: deleted.rule,
            severity: deleted.severity
          },
          targetId: alertId,
          targetType: "SYSTEM"
        }
      });
    });
  } catch (error) {
    if (hasPrismaErrorCode(error, "P2025")) {
      return err("Alert was not found");
    }

    throw error;
  }

  return ok(null);
}

async function sendWebhook(alert: AlertWithActor): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;

  if (url === undefined || url.length === 0) {
    return;
  }

  if (alert.severity !== "HIGH") {
    return;
  }

  const response = await fetch(url, {
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
    method: "POST",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
  });

  if (!response.ok) {
    console.warn(`Alert webhook responded with HTTP ${response.status} for alert ${alert.id}`);
  }
}

function sendWebhookSafely(alert: AlertWithActor): void {
  try {
    sendWebhook(alert).catch((error: unknown) => {
      console.warn(`Alert webhook delivery failed for alert ${alert.id}:`, error);
    });
  } catch {
    // Webhook delivery is fire-and-forget; failures must not block alert creation.
  }
}

/** A rule that alerts when matching events in its window, grouped by key, reach a severity threshold. */
type SpikeRule = {
  groupKey(event: AuditEventWithActor): string | null;
  matches(event: AuditEventWithActor): boolean;
  severity(count: number): AlertSeverity | null;
  toAlert(key: string, count: number, firstEvent: AuditEventWithActor): Omit<AlertInput, "severity">;
  windowMinutes: number;
};

function tieredSeverity(high: number, medium: number): (count: number) => AlertSeverity | null {
  return (count) => (count >= high ? "HIGH" : count >= medium ? "MEDIUM" : null);
}

function actorSpikeRule(input: {
  action: AuditEventWithActor["action"];
  noun: string;
  rule: AlertRule;
  severity: (count: number) => AlertSeverity | null;
  titlePrefix: string;
  windowMinutes: number;
}): SpikeRule {
  return {
    groupKey: (event) => event.actorUserId,
    matches: (event) => event.action === input.action,
    severity: input.severity,
    toAlert: (userId, count, firstEvent) => ({
      actorUserId: userId,
      description: `${count} ${input.noun} in the last ${input.windowMinutes} minutes`,
      mapId: firstEvent.mapId ?? null,
      metadata: { count, windowMinutes: input.windowMinutes },
      rule: input.rule,
      title: `${input.titlePrefix} ${firstEvent.actor?.username ?? "unknown user"}`
    }),
    windowMinutes: input.windowMinutes
  };
}

function clientIpSpikeRule(input: {
  actions: readonly AuditEventWithActor["action"][];
  noun: string;
  rule: AlertRule;
  severity: (count: number) => AlertSeverity | null;
  title: (ip: string) => string;
  windowMinutes: number;
}): SpikeRule {
  return {
    groupKey: (event) => extractClientIp(event.metadata),
    matches: (event) => input.actions.includes(event.action),
    severity: input.severity,
    toAlert: (ip, count) => ({
      actorUserId: null,
      description: `${count} ${input.noun} from ${ip} in the last ${input.windowMinutes} minutes`,
      mapId: null,
      metadata: { clientIp: ip, count, windowMinutes: input.windowMinutes },
      rule: input.rule,
      title: input.title(ip)
    }),
    windowMinutes: input.windowMinutes
  };
}

const DELETE_SPIKE = actorSpikeRule({
  action: "MARKER_DELETED",
  noun: "markers deleted",
  rule: "DELETE_SPIKE",
  severity: tieredSeverity(50, 20),
  titlePrefix: "High marker deletion rate for",
  windowMinutes: 15
});

const MAP_DATA_ACCESS_SPIKE = actorSpikeRule({
  action: "MAP_DATA_ACCESSED",
  noun: "map data access events",
  rule: "MAP_DATA_ACCESS_SPIKE",
  severity: tieredSeverity(15, 5),
  titlePrefix: "Bulk map data access for",
  windowMinutes: 10
});

const REGISTRATION_SPIKE = clientIpSpikeRule({
  actions: ["REGISTRATION"],
  noun: "registrations",
  rule: "REGISTRATION_SPIKE",
  severity: (count) => (count >= 3 ? "MEDIUM" : null),
  title: (ip) => `Multiple registrations from ${ip}`,
  windowMinutes: 60
});

const REPEATED_AUTH_FAILURES = clientIpSpikeRule({
  actions: ["FAILED_LOGIN", "FAILED_AUTHORIZATION"],
  noun: "failed login/authorization attempts",
  rule: "REPEATED_AUTH_FAILURES",
  severity: tieredSeverity(15, 5),
  title: (ip) => `Repeated authentication failures from ${ip}`,
  windowMinutes: 5
});

async function detectSpikes(
  events: AuditEventWithActor[],
  since: Date,
  until: Date,
  rule: SpikeRule
): Promise<AlertWithActor[]> {
  const windowStart = getWindowStart(since, until, rule.windowMinutes * 60 * 1000);
  const groups = new Map<string, { count: number; firstEvent: AuditEventWithActor }>();

  for (const event of events) {
    const key = event.createdAt >= windowStart && rule.matches(event) ? rule.groupKey(event) : null;

    if (key === null) {
      continue;
    }

    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, { count: 1, firstEvent: event });
    } else {
      group.count += 1;
    }
  }

  const results: AlertWithActor[] = [];

  for (const [key, { count, firstEvent }] of groups.entries()) {
    const severity = rule.severity(count);
    const alert = severity === null
      ? null
      : await createAlert({ ...rule.toAlert(key, count, firstEvent), severity });

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
          description: `Admin ${actor.username} logged in from a new IP address`,
          mapId: event.mapId ?? null,
          metadata: {
            username: actor.username
          },
          rule: "NEW_ADMIN_IP",
          severity: "HIGH",
          title: `New admin login IP for ${actor.username}`
        })
      : await createAlert({
          actorUserId: event.actorUserId,
          description: `${actor.username} logged in from a new IP address`,
          mapId: event.mapId ?? null,
          metadata: {
            username: actor.username
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

type AlertInput = {
  actorUserId: string | null;
  description: string;
  mapId: string | null;
  metadata: Record<string, unknown>;
  rule: AlertRule;
  severity: AlertSeverity;
  title: string;
};

/**
 * Null-actor rules are keyed by source IP (carried in metadata.clientIp), so
 * an open alert for one IP does not swallow detections for another.
 */
function getDedupClientIp(input: AlertInput): string | null {
  return input.actorUserId === null ? extractClientIp(input.metadata) : null;
}

function buildDedupKey(input: {
  actorUserId: string | null;
  clientIp: string | null;
  mapId: string | null;
  rule: string;
}): string {
  return ["alert", input.rule, input.actorUserId ?? "", input.mapId ?? "", input.clientIp ?? ""].join(":");
}

/**
 * Create an alert unless an equivalent one is already open within the dedup
 * window. A detection more severe than the open duplicate escalates it in
 * place (and notifies again). Returns null when nothing changed.
 *
 * An equivalent alert deleted by an admin within the window also suppresses
 * the detection.
 *
 * The check-and-write runs under a transaction-scoped advisory lock on the
 * dedup key so concurrent detection runs (other processes included) cannot
 * both create the same alert.
 */
async function createAlert(input: AlertInput): Promise<AlertWithActor | null> {
  const clientIp = getDedupClientIp(input);
  const dedupKey = buildDedupKey({ ...input, clientIp });

  const alert = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dedupKey}))`;
    const windowStart = new Date(Date.now() - ALERT_DEDUP_WINDOW_MS);

    const existing = await tx.alert.findFirst({
      orderBy: {
        createdAt: "desc"
      },
      where: {
        actorUserId: input.actorUserId,
        createdAt: {
          gte: windowStart
        },
        mapId: input.mapId,
        ...(clientIp === null ? {} : { metadata: { path: ["clientIp"], equals: clientIp } }),
        rule: input.rule,
        status: "OPEN"
      }
    });

    if (existing === null) {
      // An admin deleted an equivalent alert within the window: treat the
      // detection as already handled rather than re-creating it.
      const recentDeletion = await tx.auditEvent.findFirst({
        select: { id: true },
        where: {
          action: "ALERT_DELETED",
          createdAt: {
            gte: windowStart
          },
          metadata: {
            path: ["dedupKey"],
            equals: dedupKey
          }
        }
      });

      if (recentDeletion !== null) {
        return null;
      }

      return tx.alert.create({
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
        include: ALERT_INCLUDE
      });
    }

    if (SEVERITY_RANK[input.severity] <= SEVERITY_RANK[existing.severity]) {
      return null;
    }

    return tx.alert.update({
      data: {
        description: input.description,
        metadata: input.metadata as Prisma.InputJsonValue,
        severity: input.severity,
        title: input.title
      },
      include: ALERT_INCLUDE,
      where: {
        id: existing.id
      }
    });
  });

  if (alert === null) {
    return null;
  }

  // Notify only after the transaction committed; neither channel may block
  // or fail alert creation.
  const serialized = serializeAlert(alert);

  sendWebhookSafely(serialized);
  dispatchDiscordSafely({ kind: "alert", alert: serialized });

  return serialized;
}

function getWindowStart(since: Date, until: Date, windowMs: number): Date {
  return new Date(Math.max(since.getTime(), until.getTime() - windowMs));
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
  alert: Prisma.AlertGetPayload<{ include: typeof ALERT_INCLUDE }>
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
