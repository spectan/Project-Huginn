import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createMarkerDependencies } from "@/lib/markers/database";
import { deleteMarker, updateMarker } from "@/lib/markers/marker-service";
import type { MarkerType } from "@/lib/markers/marker-types";
import { getClientIp } from "@/lib/network/client-ip";

type RouteContext = {
  params: Promise<{
    markerId: string;
    markerType: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Write access is required" }, { status: 403 });
  }

  const { markerId, markerType } = await context.params;

  if (!isMarkerType(markerType)) {
    return NextResponse.json({ error: "Marker type is invalid" }, { status: 400 });
  }

  const body = await readJson(request);
  const result = await updateMarker(
    { actor: viewer, input: body, markerId, markerType },
    createMarkerDependencies(getClientIp(request))
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ marker: result.value });
}

export async function DELETE(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Write access is required" }, { status: 403 });
  }

  const { markerId, markerType } = await context.params;

  if (!isMarkerType(markerType)) {
    return NextResponse.json({ error: "Marker type is invalid" }, { status: 400 });
  }

  const result = await deleteMarker(
    { actor: viewer, markerId, markerType },
    createMarkerDependencies(getClientIp(request))
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isMarkerType(value: string): value is MarkerType {
  return (
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
  );
}
