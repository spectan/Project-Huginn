import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDeletedMarkerDependencies } from "@/lib/deleted-markers/database";
import { listRestorableDeletedMarkers } from "@/lib/deleted-markers/deleted-marker-service";
import { AuditHistoryAccessDenied } from "../history/audit-history-view";
import { DeletedMarkersView } from "./deleted-markers-view";

export default async function AdminDeletedMarkersPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AuditHistoryAccessDenied message="Admin access is required" />;
  }

  const result = await listRestorableDeletedMarkers(
    { actor: viewer },
    createDeletedMarkerDependencies()
  );

  if (!result.ok) {
    return <AuditHistoryAccessDenied message={result.error} />;
  }

  return <DeletedMarkersView markers={result.value} />;
}
