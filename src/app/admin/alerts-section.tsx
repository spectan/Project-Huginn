"use client";

import Link from "next/link";
import { AlertsTable, useAdminAlerts } from "./alerts-table";

export function AlertsSection() {
  const { alerts, error } = useAdminAlerts("/api/admin/alerts?status=OPEN&limit=10");

  return (
    <section className="admin-panel">
      <div className="admin-section-header">
        <h2 className="admin-section-title">Alerts</h2>
        <Link className="admin-btn admin-btn--ghost admin-btn--small" href="/admin/security">
          View all →
        </Link>
      </div>
      <AlertsTable alerts={alerts} error={error} />
    </section>
  );
}
