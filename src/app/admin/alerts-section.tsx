"use client";

import { useCallback, useEffect, useState } from "react";

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
  actorUserId: string | null;
  mapName: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

const severityPillClass: Record<AlertSeverity, string> = {
  HIGH: "admin-pill admin-pill--danger",
  MEDIUM: "admin-pill admin-pill--warning",
  LOW: "admin-pill admin-pill--info"
};

export function AlertsSection() {
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "ALL">("OPEN");
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = alerts === null;

  const loadAlerts = useCallback(async (filter: AlertStatus | "ALL") => {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    const response = await fetch(`/api/admin/alerts?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load alerts");
    const data = (await response.json()) as { alerts: AlertListItem[] };
    return data.alerts;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAlerts(statusFilter)
      .then((data) => {
        if (!cancelled) setAlerts(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, loadAlerts]);

  const runDetection = async () => {
    setDetecting(true);
    setError(null);
    setAlerts(null);
    try {
      const response = await fetch("/api/admin/alerts", { method: "POST" });
      if (!response.ok) throw new Error("Failed to run detection");
      const data = await loadAlerts(statusFilter);
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDetecting(false);
    }
  };

  const updateStatus = async (id: string, action: "acknowledge" | "resolve") => {
    setError(null);
    setAlerts(null);
    try {
      const response = await fetch(`/api/admin/alerts/${id}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error(`Failed to ${action} alert`);
      const data = await loadAlerts(statusFilter);
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <section className="admin-panel">
      <h2 className="admin-section-title">Alerts</h2>
      <div className="admin-toolbar">
        <button type="button" className="admin-btn" onClick={runDetection} disabled={detecting}>
          {detecting ? "Running detection…" : "Run detection now"}
        </button>
        <label>
          Status:{" "}
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
                  {alert.status === "OPEN" && (
                    <>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--small"
                        onClick={() => updateStatus(alert.id, "acknowledge")}
                      >
                        Acknowledge
                      </button>{" "}
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--small"
                        onClick={() => updateStatus(alert.id, "resolve")}
                      >
                        Resolve
                      </button>
                    </>
                  )}
                  {alert.status === "ACKNOWLEDGED" && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--small"
                      onClick={() => updateStatus(alert.id, "resolve")}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
