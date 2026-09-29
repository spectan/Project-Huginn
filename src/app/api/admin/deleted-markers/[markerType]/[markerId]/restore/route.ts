import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDeletedMarkerDependencies } from "@/lib/deleted-markers/database";
import { restoreDeletedMarker } from "@/lib/deleted-markers/deleted-marker-service";
import type { MarkerType } from "@/lib/markers/marker-types";
import { getClientIp } from "@/lib/network/client-ip";

type RouteContext = {
  params: Promise<{
    markerId: string;
    markerType: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const { markerId, markerType } = await context.params;
  const parsedMarkerType = parseMarkerType(markerType);

  if (parsedMarkerType === null) {
    return NextResponse.json({ error: "Marker type is invalid" }, { status: 400 });
  }

  const result = await restoreDeletedMarker({
    actor: viewer,
    markerId,
    markerType: parsedMarkerType
  }, createDeletedMarkerDependencies(getClientIp(request)));

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: getRestoreErrorStatus(result.error) }
    );
  }

  return NextResponse.json({ restored: result.value });
}

function getRestoreErrorStatus(error: string): 400 | 403 | 404 {
  if (error === "Admin access is required") {
    return 403;
  }

  return error === "Deleted marker was not found" ? 404 : 400;
}

function parseMarkerType(value: string): MarkerType | null {
  if (
    value === "tower" ||
    value === "deed" ||
    value === "note" ||
    value === "rift" ||
    value === "camp" ||
    value === "minedoor" ||
    value === "locateSoul" ||
    value === "bridge" ||
    value === "canal" ||
    value === "highway" ||
    value === "tunnel"
  ) {
    return value;
  }

  return null;
}
