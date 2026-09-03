import { listAdminUsers } from "@/lib/admin/users";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "../admin-access-denied";
import { AdminAccountsView } from "./accounts-view";

export default async function AdminAccountsPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AdminAccessDenied title="Accounts" />;
  }

  const result = await listAdminUsers(
    { actor: viewer },
    createAdminUserDependencies()
  );

  if (!result.ok) {
    return <AdminAccessDenied title="Accounts" message={result.error} />;
  }

  return (
    <AdminAccountsView
      maps={result.value.maps}
      users={result.value.users}
      viewerCanManageGlobalAccounts={result.value.viewerCanManageGlobalAccounts}
    />
  );
}
