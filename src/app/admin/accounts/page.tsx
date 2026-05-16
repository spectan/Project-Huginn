import { listAdminUsers } from "@/lib/admin/users";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccountsAccessDenied, AdminAccountsView } from "./accounts-view";

export default async function AdminAccountsPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AdminAccountsAccessDenied message="Admin access is required" />;
  }

  const result = await listAdminUsers(
    { actor: viewer },
    createAdminUserDependencies()
  );

  if (!result.ok) {
    return <AdminAccountsAccessDenied message={result.error} />;
  }

  return (
    <AdminAccountsView
      maps={result.value.maps}
      users={result.value.users}
      viewerCanManageGlobalAccounts={result.value.viewerCanManageGlobalAccounts}
    />
  );
}
