import { AdminTabs, type AdminRoute } from "./admin-tabs";

export type { AdminRoute } from "./admin-tabs";

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  currentRoute: AdminRoute;
};

export function AdminHeader({ title, subtitle = "Admin", currentRoute }: AdminHeaderProps) {
  return (
    <header className="history-header">
      <div>
        <p>{subtitle}</p>
        <h1>{title}</h1>
      </div>
      <AdminTabs currentRoute={currentRoute} />
      <a href="/map">Back to map</a>
    </header>
  );
}
