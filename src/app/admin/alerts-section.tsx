"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";
type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

type AlertListItem = {
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

const severityPillClass: Record<AlertSeverity, string> = {
  HIGH: "admin-pill admin-pill--danger",
  MEDIUM: "admin-pill admin-pill--warning",
  LOW: "admin-pill admin-pill--info"
};

export function AlertsSection() {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = alerts === null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/alerts?status=OPEN&limit=10")
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
  }, []);

  return (
    <section className="admin-panel">
      <div className="admin-section-header">
        <h2 className="admin-section-title">Alerts</h2>
        <Link className="admin-btn admin-btn--ghost admin-btn--small" href="/admin/security">
          View all →
        </Link>
      </div>

      {error !== null ? <section className="admin-empty">{error}</section> : null}
      {loading ? <p>Loading…</p> : null}

      {alerts !== null && alerts.length === 0 ? (
        <section className="admin-empty">No alerts.</section>
      ) : null}

      {alerts !== null && alerts.length > 0 ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Alert</th>
              <th>Map</th>
              <th>Actor</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>
                  <span className={severityPillClass[alert.severity]}>
                    {alert.severity.toLowerCase()}
                  </span>
                </td>
                <td>
                  <strong>{alert.title}</strong>
                  <small>{alert.description}</small>
                  <small>Rule: {alert.rule}</small>
                </td>
                <td>{alert.mapName ?? "—"}</td>
                <td>{alert.actorUsername ?? "—"}</td>
                <td>
                  <time dateTime={alert.createdAt}>
                    {new Date(alert.createdAt).toLocaleString()}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
