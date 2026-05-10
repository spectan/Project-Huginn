import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { createMarkerDependencies, findActiveMap, listNoteCategories } from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";
import MapWorkspace from "./map-workspace";

export default async function MapPage() {
  const viewer = await getCurrentViewer();
  const workspace = await getWorkspaceData(viewer);

  return (
    <MapWorkspace
      initialMarkers={workspace?.markers ?? []}
      initialNoteCategories={workspace?.noteCategories ?? []}
      map={workspace?.map ?? null}
      viewer={viewer}
    />
  );
}

async function getWorkspaceData(viewer: Awaited<ReturnType<typeof getCurrentViewer>>) {
  if (viewer === null || !canReadMap(viewer)) {
    return null;
  }

  const map = await findActiveMap();

  if (map === null) {
    return null;
  }

  const result = await listMarkers(
    { actor: viewer, mapId: map.id },
    createMarkerDependencies()
  );

  if (!result.ok) {
    return null;
  }

  return {
    ...result.value,
    noteCategories: await listNoteCategories(map.id)
  };
}
