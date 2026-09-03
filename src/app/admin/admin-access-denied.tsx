type AdminAccessDeniedProps = {
  title: string;
  message?: string;
};

export function AdminAccessDenied({ title, message = "Admin access is required" }: AdminAccessDeniedProps) {
  return (
    <>
      <h1 className="admin-page-title">{title}</h1>
      <section className="admin-empty">{message}</section>
    </>
  );
}
