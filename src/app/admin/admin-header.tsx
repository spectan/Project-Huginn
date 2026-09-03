import { AdminTabs, type AdminRoute } from "./admin-tabs";

type AdminHeaderProps = {
  title: string;
  currentRoute: AdminRoute;
};

export function AdminHeader({ title, currentRoute }: AdminHeaderProps) {
  return (
    <header className="history-header">
      <div>
        <p>Admin</p>
        <h1>{title}</h1>
      </div>
      <AdminTabs currentRoute={currentRoute} />
      <a href="/map">Back to map</a>
    </header>
  );
}
