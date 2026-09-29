"use client";

import { useState } from "react";
import { type AlertSeverity, type AlertStatus, AlertsTable, useAdminAlerts } from "../alerts-table";

export function AdminAlertsView() {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "ALL">("OPEN");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "ALL">("ALL");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (statusFilter !== "ALL") params.set("status", statusFilter);
  if (severityFilter !== "ALL") params.set("severity", severityFilter);
  params.set("limit", "500");
  const { alerts, setAlerts, error, setError } = useAdminAlerts(`/api/admin/alerts?${params.toString()}`);

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

      <AlertsTable
        alerts={alerts}
        error={error}
        renderActions={(alert) => (
          <button
            aria-label={`Delete ${alert.title}`}
            className="admin-btn admin-btn--danger admin-btn--small"
            disabled={pendingDeleteId === alert.id}
            onClick={() => void deleteAlert(alert.id)}
            type="button"
          >
            Delete
          </button>
        )}
        showStatus
        wrapInPanel
      />
    </>
  );
}
