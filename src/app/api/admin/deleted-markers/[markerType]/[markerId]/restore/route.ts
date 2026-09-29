import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDeletedMarkerDependencies } from "@/lib/deleted-markers/database";
import { restoreDeletedMarker } from "@/lib/deleted-markers/deleted-marker-service";
import { ADMIN_ACCESS_REQUIRED, getMarkerErrorStatus } from "@/lib/markers/marker-errors";
import { isPersistedMarkerType } from "@/lib/markers/marker-types";
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
    return NextResponse.json({ error: ADMIN_ACCESS_REQUIRED }, { status: 403 });
  }

  const { markerId, markerType } = await context.params;

  if (!isPersistedMarkerType(markerType)) {
    return NextResponse.json({ error: "Marker type is invalid" }, { status: 400 });
  }

  const result = await restoreDeletedMarker({
    actor: viewer,
    markerId,
    markerType
  }, createDeletedMarkerDependencies(getClientIp(request)));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getMarkerErrorStatus(result.error) });
  }

  return NextResponse.json({ restored: result.value });
}
