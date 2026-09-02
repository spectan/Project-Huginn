import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "./admin-access-denied";
import { AdminHeader } from "./admin-header";

export default async function AdminDashboardPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <AdminAccessDenied title="Administration" />;
  }

  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin" subtitle="Admin" title="Administration" />
      <section className="history-empty">
        <p>Welcome to the admin dashboard.</p>
        <p>
          Use the tabs above to manage accounts, review the history log, restore deleted markers, or inspect watermarks.
        </p>
      </section>
    </main>
  );
}
