import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createMarkerDependencies } from "@/lib/markers/database";
import { disbandDeedMarker } from "@/lib/markers/marker-service";

type RouteContext = {
  params: Promise<{
    markerId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Write access is required" }, { status: 403 });
  }

  const { markerId } = await context.params;
  const result = await disbandDeedMarker(
    { actor: viewer, markerId },
    createMarkerDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.value);
}
