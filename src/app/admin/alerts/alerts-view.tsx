"use client";

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

export function AdminAlertsView() {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "ALL">("OPEN");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "ALL">("ALL");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = alerts === null;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (severityFilter !== "ALL") params.set("severity", severityFilter);
    params.set("limit", "500");
    fetch(`/api/admin/alerts?${params.toString()}`)
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
  }, [statusFilter, severityFilter]);

  const deleteAlert = async (id: string) => {
    setError(null);
    setPendingDeleteId(id);
    try {
      const response = await fetch(`/api/admin/alerts/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete alert");
      setAlerts((current) => current?.filter((alert) => alert.id !== id) ?? current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <>
      <h1 className="admin-page-title">Alerts</h1>
      <div className="admin-toolbar">
        <label>
          Status{" "}
          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as AlertStatus | "ALL");
              setAlerts(null);
              setError(null);
            }}
          >
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <label>
          Severity{" "}
          <select
            className="admin-select"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as AlertSeverity | "ALL");
              setAlerts(null);
              setError(null);
            }}
          >
            <option value="ALL">All severities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>
      </div>

      {error !== null ? <section className="admin-empty">{error}</section> : null}
      {loading ? <p>Loading…</p> : null}

      {alerts !== null && alerts.length === 0 ? (
        <section className="admin-empty">No alerts.</section>
      ) : null}

      {alerts !== null && alerts.length > 0 ? (
        <div className="admin-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Alert</th>
                <th>Map</th>
                <th>Actor</th>
                <th>Time</th>
                <th>Actions</th>
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
                    <small>Status: {alert.status.toLowerCase()}</small>
                  </td>
                  <td>{alert.mapName ?? "—"}</td>
                  <td>{alert.actorUsername ?? "—"}</td>
                  <td>
                    <time dateTime={alert.createdAt}>
                      {new Date(alert.createdAt).toLocaleString()}
                    </time>
                  </td>
                  <td>
                    <button
                      aria-label={`Delete ${alert.title}`}
                      className="admin-btn admin-btn--danger admin-btn--small"
                      disabled={pendingDeleteId === alert.id}
                      onClick={() => void deleteAlert(alert.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
