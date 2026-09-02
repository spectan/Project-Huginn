import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import type { UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import { CANARY_MARKERS_PER_MAP, generateCanaryMarkers } from "@/lib/canaries/canary-service";
import type { CanaryDependencies } from "@/lib/canaries/database";
import {
  listMarkers,
  type MarkerServiceDependencies
} from "@/lib/markers/marker-service";
import type { WorkspaceMarker } from "@/lib/markers/marker-types";

type ExportActor = UserAccess & {
  id: string;
};

export type MarkerExportDependencies = MarkerServiceDependencies & CanaryDependencies;

export async function exportMarkers(
  input: { actor: ExportActor; mapId: string },
  dependencies: MarkerExportDependencies
): Promise<Result<{
  exportedAt: string;
  map: { id: string; name: string };
  markers: WorkspaceMarker[];
}>> {
  const listed = await listMarkers(input, dependencies);

  if (!listed.ok) {
    return listed;
  }

  const canaries = await getOrCreateCanaries(
    { mapId: input.mapId, userId: input.actor.id },
    { heightPx: listed.value.map.heightPx, widthPx: listed.value.map.widthPx },
    dependencies
  );

  const markers = [...listed.value.markers, ...canaries].sort(compareMarkersByPosition);
  const metadata = { markerCount: markers.length };
  assertNoCoordinateMetadata(metadata);
  await dependencies.recordAudit({
    action: "MARKERS_EXPORTED",
    actorUserId: input.actor.id,
    mapId: input.mapId,
    metadata,
    targetId: input.mapId,
    targetType: "MAP"
  });

  return ok({
    exportedAt: dependencies.now().toISOString(),
    map: {
      id: listed.value.map.id,
      name: listed.value.map.name
    },
    markers
  });
}

export async function getOrCreateCanaries(
  input: { mapId: string; userId: string },
  bounds: { heightPx: number; widthPx: number },
  dependencies: CanaryDependencies
): Promise<WorkspaceMarker[]> {
  const existing = await dependencies.listCanaryMarkers(input);

  if (existing.length >= CANARY_MARKERS_PER_MAP) {
    return existing.map((record) => record.payload).filter(isWorkspaceMarker);
  }

  try {
    const generated = generateCanaryMarkers(input, bounds);
    const created = await dependencies.createCanaryMarkers({
      mapId: input.mapId,
      markers: generated,
      userId: input.userId
    });

    return created.map((record) => record.payload).filter(isWorkspaceMarker);
  } catch {
    // Concurrent export may have created the canaries first; fall back to listing.
    const raced = await dependencies.listCanaryMarkers(input);

    return raced.map((record) => record.payload).filter(isWorkspaceMarker);
  }
}

function isWorkspaceMarker(payload: unknown): payload is WorkspaceMarker {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    "type" in payload &&
    "x" in payload &&
    "y" in payload
  );
}

function compareMarkersByPosition(a: WorkspaceMarker, b: WorkspaceMarker): number {
  if (a.x !== b.x) {
    return a.x - b.x;
  }

  if (a.y !== b.y) {
    return a.y - b.y;
  }

  return a.id.localeCompare(b.id);
}
