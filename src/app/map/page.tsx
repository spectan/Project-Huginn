import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { findLatestUniqueSlain } from "@/lib/events/database";
import { createUserMapSettingsDependencies, findUserFavoriteServerId } from "@/lib/map-settings/database";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";
import { getUserMapSettings } from "@/lib/map-settings/map-settings-service";
import {
  createMarkerDependencies,
  findActiveMap,
  listActiveMapSummaries,
  listNoteCategories
} from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";
import type { WorkspaceMap, WorkspaceMapLayer } from "@/lib/markers/marker-types";
import { WATERMARK_VERSION } from "@/lib/watermark/config";
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
      initialMarkers={workspace?.markers ?? []}
      initialNoteCategories={workspace?.noteCategories ?? []}
      initialSettings={workspace?.settings}
      lastUniqueSlainAt={workspace?.lastUniqueSlainAt ?? null}
      map={workspace?.map ?? null}
      selectedLayerId={params?.layer}
      servers={workspace?.servers ?? []}
      viewer={viewer}
    />
  );
}

export async function getWorkspaceData(
  viewer: Awaited<ReturnType<typeof getCurrentViewer>>,
  requestedMapSlug?: string
) {
  if (viewer === null) {
    return null;
  }

  const [servers, favoriteServerId] = await Promise.all([
    listActiveMapSummaries(),
    findUserFavoriteServerId(viewer.id)
  ]);
  const readableServers = getReadableServerSummaries(viewer, servers);
  const requestedMapId = resolveMapIdFromSlug(requestedMapSlug, readableServers);
  const initialMapId = getInitialMapServerId(requestedMapId, favoriteServerId, readableServers);
  const map = initialMapId === undefined ? null : await findActiveMap(initialMapId);

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

  const [noteCategories, mapSettings, latestUniqueSlain] = await Promise.all([
    listNoteCategories(map.id),
    getReadableUserMapSettings(viewer, map.id),
    findLatestUniqueSlain(map.id)
  ]);
  const settings = {
    ...mapSettings,
    favoriteServerId: mapSettings.favoriteServerId ?? favoriteServerId
  };

  const watermarkedMap = applyWatermarkUrls(result.value.map);

  return {
    ...result.value,
    lastUniqueSlainAt: latestUniqueSlain === null
      ? null
      : new Date(latestUniqueSlain.timestamp * 1000).toISOString(),
    map: watermarkedMap,
    noteCategories,
    servers: readableServers,
    settings
  };
}

function applyWatermarkUrls(map: WorkspaceMap): WorkspaceMap {
  // Version-stamp the URLs so bumping WATERMARK_VERSION invalidates
  // browser-cached copies of the map image from a previous scheme.
  const baseUrl = `/api/maps/${map.id}/image?v=${WATERMARK_VERSION}`;

  return {
    ...map,
    imageSrc: baseUrl,
    layers: map.layers.map((layer: WorkspaceMapLayer) => ({
      ...layer,
      imageSrc: `${baseUrl}&layer=${encodeURIComponent(layer.id)}`,
    })),
  };
}

export function getInitialMapServerId(
  requestedMapId: string | undefined,
  favoriteServerId: string | null,
  readableServers: Array<{ id: string }>
): string | undefined {
  const readableServerIds = new Set(readableServers.map((server) => server.id));

  if (requestedMapId !== undefined && readableServerIds.has(requestedMapId)) {
    return requestedMapId;
  }

  if (favoriteServerId !== null && readableServerIds.has(favoriteServerId)) {
    return favoriteServerId;
  }

  return readableServers[0]?.id;
}

export function resolveMapIdFromSlug(
  slug: string | undefined,
  servers: Array<{ id: string }>
): string | undefined {
  if (slug === undefined) return undefined;

  // Exact match — backward compat for old URLs that already use full DB IDs
  if (servers.some((s) => s.id === slug)) {
    return slug;
  }

  // Try with map- prefix (e.g., "celebration" → "map-celebration")
  const prefixedId = `map-${slug}`;
  if (servers.some((s) => s.id === prefixedId)) {
    return prefixedId;
  }

  return undefined;
}

export function getReadableServerSummaries<T extends { id: string }>(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentViewer>>>,
  servers: T[]
): T[] {
  return servers.filter((server) => canReadMap(viewer, server.id));
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
