import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createAuditHistoryDependencies } from "@/lib/audit-history/database";
import { listAuditHistory } from "@/lib/audit-history/audit-history";
import { AdminAccessDenied } from "../admin-access-denied";
import { AuditHistoryView } from "./audit-history-view";

type AdminHistoryPageProps = {
  searchParams?: Promise<{
    before?: string | string[];
  }>;
};

export default async function AdminHistoryPage({ searchParams }: AdminHistoryPageProps) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AdminAccessDenied title="History" />;
  }

  const params = await searchParams;
  const result = await listAuditHistory(
    { actor: viewer, before: getSingleSearchParam(params?.before) },
    createAuditHistoryDependencies()
  );

  if (!result.ok) {
    return <AdminAccessDenied title="History" message={result.error} />;
  }

  return (
    <AuditHistoryView
      events={result.value.events}
      nextCursor={result.value.nextCursor}
    />
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
