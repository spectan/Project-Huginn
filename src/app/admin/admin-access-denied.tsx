import { AdminHeader } from "./admin-header";

type AdminAccessDeniedProps = {
  title: string;
  message?: string;
};

export function AdminAccessDenied({ title, message = "Admin access is required" }: AdminAccessDeniedProps) {
  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin" title={title} />
      <section className="history-empty">{message}</section>
    </main>
  );
}
