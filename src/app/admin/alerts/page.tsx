import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "../admin-access-denied";
import { AdminHeader } from "../admin-header";
import { AlertsDashboardView } from "./alerts-dashboard-view";

export default async function AlertsPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <AdminAccessDenied title="Alerts" />;
  }

  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin/alerts" title="Alerts" />
      <AlertsDashboardView />
    </main>
  );
}
