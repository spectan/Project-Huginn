import type { ReactNode } from "react";
import { AdminBackToMapLink, AdminNav, AdminTopbarTitle } from "./admin-nav";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <AdminNav />
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
