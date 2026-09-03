export type AlertRule =
  | "FULL_MARKER_FETCH_VOLUME_SPIKE"
  | "DELETE_SPIKE"
  | "NEW_ADMIN_IP"
  | "OFF_HOURS_ADMIN_ACTIVITY"
  | "REPEATED_AUTH_FAILURES";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type AlertWithActor = {
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  createdAt: Date;
  description: string;
  id: string;
  mapId: string | null;
  metadata: unknown;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  rule: AlertRule;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  updatedAt: Date;
};

export type DetectAlertsInput = {
  since?: Date;
  until?: Date;
};
