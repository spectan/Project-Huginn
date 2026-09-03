import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav, AdminTopbarTitle } from "./admin-nav";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <AdminNav />
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <AdminTopbarTitle />
          <Link className="admin-btn admin-btn--ghost admin-btn--small admin-topbar-back" href="/map">
            ← Back to map
          </Link>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
