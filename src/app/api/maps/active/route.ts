import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { createMarkerDependencies, findActiveMap } from "@/lib/markers/database";
import { listMarkers } from "@/lib/markers/marker-service";

export async function GET() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canReadMap(viewer)) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const map = await findActiveMap();

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
