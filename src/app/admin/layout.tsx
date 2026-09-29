import type { ReactNode } from "react";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canAdminister } from "@/lib/domain/permissions";
import { AdminBackToMapLink, AdminNav, AdminTopbarTitle } from "./admin-nav";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const viewer = await getCurrentViewer();
  const accountsOnly = viewer === null || !canAdminister(viewer);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <AdminNav accountsOnly={accountsOnly} />
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <AdminTopbarTitle />
          <AdminBackToMapLink />
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
