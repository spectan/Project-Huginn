import { NextResponse } from "next/server";
import { triggerAlertDetection } from "@/lib/alerts/alert-service";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { canReadMap } from "@/lib/domain/permissions";
import { createMarkerDependencies, findActiveMap, listActiveMapSummaries } from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";
import { getClientIp } from "@/lib/network/client-ip";

export async function GET(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const readableMap = (await listActiveMapSummaries()).find((candidate) => canReadMap(viewer, candidate.id));
  const map = readableMap === undefined ? null : await findActiveMap(readableMap.id);

  if (map === null) {
    return NextResponse.json({ error: "Active map was not found" }, { status: 404 });
  }

  const result = await listMarkers(
    { actor: viewer, includeCanaries: true, mapId: map.id },
    createMarkerDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordMapDataAccess(viewer.id, map.id, request);
  triggerAlertDetection();

  return NextResponse.json(result.value);
}

function recordMapDataAccess(actorUserId: string, mapId: string, request: Request): void {
  try {
    const metadata = { clientIp: getClientIp(request) ?? null };
    assertNoCoordinateMetadata(metadata);
    void prisma.auditEvent
      .create({
        data: {
          action: "MAP_DATA_ACCESSED",
          actorUserId,
          metadata,
          targetId: mapId,
          targetType: "MAP"
        }
      })
      .catch(() => undefined);
  } catch {
    // Auditing must never break this data-serving route.
  }
}
