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

export function AlertsDashboardView() {
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

  const severityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case "HIGH":
        return "#ef4444";
      case "MEDIUM":
        return "#f59e0b";
      default:
        return "#3b82f6";
    }
  };

  return (
    <section className="history-empty">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" className="history-action-button" onClick={runDetection} disabled={detecting}>
          {detecting ? "Running detection…" : "Run detection now"}
        </button>
        <label>
          Filter:
          <select
            className="history-select"
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

      {error && <p style={{ color: "#ef4444" }}>{error}</p>}
      {loading && <p>Loading…</p>}

      {alerts !== null && alerts.length === 0 ? (
        <p>No alerts.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {alerts?.map((alert) => (
            <li
              key={alert.id}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.24)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{alert.title}</strong>
                  <span
                    style={{
                      marginLeft: 8,
                      textTransform: "lowercase",
                      fontSize: 12,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: severityColor(alert.severity),
                      color: "#fff",
                    }}
                  >
                    {alert.severity.toLowerCase()}
                  </span>
                </div>
                <small>{new Date(alert.createdAt).toLocaleString()}</small>
              </div>
              <p>{alert.description}</p>
              <small>
                {alert.actorUsername && <>User: {alert.actorUsername} </>}
                {alert.mapName && <>Map: {alert.mapName} </>}
                Status: {alert.status.toLowerCase()}
              </small>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                {alert.status === "OPEN" && (
                  <>
                    <button type="button" className="history-action-button" onClick={() => updateStatus(alert.id, "acknowledge")}>Acknowledge</button>
                    <button type="button" className="history-action-button" onClick={() => updateStatus(alert.id, "resolve")}>Resolve</button>
                  </>
                )}
                {alert.status === "ACKNOWLEDGED" && (
                  <button type="button" className="history-action-button" onClick={() => updateStatus(alert.id, "resolve")}>Resolve</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
