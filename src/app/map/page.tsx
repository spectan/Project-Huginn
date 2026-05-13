import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { createUserMapSettingsDependencies } from "@/lib/map-settings/database";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";
import { getUserMapSettings } from "@/lib/map-settings/map-settings-service";
import {
  createMarkerDependencies,
  findActiveMap,
  listActiveMapSummaries,
  listNoteCategories
} from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";
import { fetchWurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";
import MapWorkspace from "./map-workspace";

type MapPageProps = {
  searchParams?: Promise<{
    layer?: string;
    server?: string;
  }>;
};

export default async function MapPage({ searchParams }: MapPageProps) {
  const viewer = await getCurrentViewer();
  const params = await searchParams;
  const workspace = await getWorkspaceData(viewer, params?.server);

  return (
    <MapWorkspace
      initialEventFeed={workspace?.eventFeed}
      initialMarkers={workspace?.markers ?? []}
      initialNoteCategories={workspace?.noteCategories ?? []}
      initialSettings={workspace?.settings}
      map={workspace?.map ?? null}
      selectedLayerId={params?.layer}
      servers={workspace?.servers ?? []}
      viewer={viewer}
    />
  );
}

async function getWorkspaceData(
  viewer: Awaited<ReturnType<typeof getCurrentViewer>>,
  requestedMapId?: string
) {
  if (viewer === null || !canReadMap(viewer)) {
    return null;
  }

  const [requestedMap, fallbackMap, servers] = await Promise.all([
    requestedMapId === undefined ? null : findActiveMap(requestedMapId),
    findActiveMap(),
    listActiveMapSummaries()
  ]);
  const map = requestedMap ?? fallbackMap;

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

  const [eventFeed, noteCategories, settings] = await Promise.all([
    getReadableWurmMapsEventFeed(map.name),
    listNoteCategories(map.id),
    getReadableUserMapSettings(viewer, map.id)
  ]);

  return {
    ...result.value,
    eventFeed,
    noteCategories,
    servers,
    settings
  };
}

async function getReadableUserMapSettings(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewer>>>,
  mapId: string
) {
  const result = await getUserMapSettings(
    { actor: viewer, mapId },
    createUserMapSettingsDependencies()
  );

  return result.ok ? result.value : DEFAULT_USER_MAP_SETTINGS;
}

async function getReadableWurmMapsEventFeed(serverName: string) {
  const result = await fetchWurmMapsEventFeed(serverName);
  return result.ok ? result.value : null;
}
