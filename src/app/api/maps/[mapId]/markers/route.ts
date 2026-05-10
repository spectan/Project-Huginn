import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createMarkerDependencies } from "@/lib/markers/database";
import { createMarker } from "@/lib/markers/marker-service";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Write access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const { mapId } = await context.params;
  const result = await createMarker(
    { actor: viewer, input: body, mapId },
    createMarkerDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ marker: result.value }, { status: 201 });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
