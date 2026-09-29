"use client";

import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from "react";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type AlertListItem = {
  id: string;
  rule: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  actorUsername: string | null;
  mapName: string | null;
  createdAt: string;
};

export const severityPillClass: Record<AlertSeverity, string> = {
  HIGH: "admin-pill admin-pill--danger",
  MEDIUM: "admin-pill admin-pill--warning",
  LOW: "admin-pill admin-pill--info"
};

/** Loads alerts from `url` (refetching when it changes); `alerts` is null while loading. */
export function useAdminAlerts(url: string): {
  alerts: AlertListItem[] | null;
  setAlerts: Dispatch<SetStateAction<AlertListItem[] | null>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
} {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load alerts");
        return (await response.json()) as { alerts: AlertListItem[] };
      })
      .then((data) => {
        if (!cancelled) setAlerts(data.alerts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { alerts, setAlerts, error, setError };
}

/** Error, loading and empty states plus the alerts table (optionally wrapped in a panel). */
export function AlertsTable({
  alerts,
  error,
  renderActions,
  showStatus = false,
  wrapInPanel = false
}: {
  alerts: AlertListItem[] | null;
  error: string | null;
  renderActions?: (alert: AlertListItem) => ReactNode;
  showStatus?: boolean;
  wrapInPanel?: boolean;
}) {
  const table =
    alerts !== null && alerts.length > 0 ? (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Alert</th>
            <th>Map</th>
            <th>Actor</th>
            <th>Time</th>
            {renderActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id}>
              <td>
                <span className={severityPillClass[alert.severity]}>{alert.severity.toLowerCase()}</span>
              </td>
              <td>
                <strong>{alert.title}</strong>
                <small>{alert.description}</small>
                <small>Rule: {alert.rule}</small>
                {showStatus ? <small>Status: {alert.status.toLowerCase()}</small> : null}
              </td>
              <td>{alert.mapName ?? "—"}</td>
              <td>{alert.actorUsername ?? "—"}</td>
              <td>
                <time dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleString()}</time>
              </td>
              {renderActions ? <td>{renderActions(alert)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    ) : null;

  return (
    <>
      {error !== null ? <section className="admin-empty">{error}</section> : null}
      {alerts === null ? <p>Loading…</p> : null}
      {alerts !== null && alerts.length === 0 ? <section className="admin-empty">No alerts.</section> : null}
      {table !== null && wrapInPanel ? <div className="admin-panel">{table}</div> : table}
    </>
  );
}
