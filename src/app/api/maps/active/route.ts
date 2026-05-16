import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { createMarkerDependencies, findActiveMap, listActiveMapSummaries } from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";

export async function GET() {
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
    { actor: viewer, mapId: map.id },
    createMarkerDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.value);
}
