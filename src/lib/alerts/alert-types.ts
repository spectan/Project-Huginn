export type AlertRule =
  | "DELETE_SPIKE"
  | "MAP_DATA_ACCESS_SPIKE"
  | "NEW_ADMIN_IP"
  | "NEW_IP_LOGIN"
  | "OFF_HOURS_ADMIN_ACTIVITY"
  | "REGISTRATION_SPIKE"
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
  mapName: string | null;
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
