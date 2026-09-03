import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDeletedMarkerDependencies } from "@/lib/deleted-markers/database";
import { listRestorableDeletedMarkers } from "@/lib/deleted-markers/deleted-marker-service";
import { AdminAccessDenied } from "../admin-access-denied";
import { DeletedMarkersView } from "./deleted-markers-view";

export default async function AdminDeletedMarkersPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AdminAccessDenied title="Deleted markers" />;
  }

  const result = await listRestorableDeletedMarkers(
    { actor: viewer },
    createDeletedMarkerDependencies()
  );

  if (!result.ok) {
    return <AdminAccessDenied title="Deleted markers" message={result.error} />;
  }

  return <DeletedMarkersView markers={result.value} />;
}
