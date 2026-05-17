import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDeletedMarkerDependencies } from "@/lib/deleted-markers/database";
import { restoreDeletedMarker } from "@/lib/deleted-markers/deleted-marker-service";
import type { MarkerType } from "@/lib/markers/marker-types";

type RouteContext = {
  params: Promise<{
    markerId: string;
    markerType: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
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
  }, createDeletedMarkerDependencies());

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Admin access is required" ? 403 : 400 }
    );
  }

  return NextResponse.json({ restored: result.value });
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
