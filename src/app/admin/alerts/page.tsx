import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "../admin-access-denied";
import { AdminAlertsView } from "./alerts-view";

export default async function AdminAlertsPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <AdminAccessDenied title="Alerts" />;
  }

  return <AdminAlertsView />;
}
