import { NextResponse } from "next/server";
import { join } from "path";
import { readFile } from "fs/promises";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mapId: string }> }
) {
  const viewer = await getCurrentViewer();
  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const { mapId } = await params;
  if (!canReadMap(viewer, mapId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const layerId = searchParams.get("layer") ?? undefined;

  let imagePath: string | null = null;
  let resolvedLayerId = "";

  if (layerId !== undefined && layerId.length > 0) {
    const layer = await prisma.mapLayer.findFirst({
      where: { id: layerId, mapId },
    });
    if (layer === null) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 });
    }
    imagePath = layer.imagePath;
    resolvedLayerId = layer.id;
  } else {
    const map = await prisma.map.findUnique({
      where: { id: mapId },
    });
    if (map === null) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }
    imagePath = map.imagePath;
    resolvedLayerId = `${mapId}:default`;
  }

  if (imagePath === null || imagePath.length === 0) {
    return NextResponse.json({ error: "No image configured" }, { status: 404 });
  }

  const rawFilePath = join(process.cwd(), "public", imagePath);
  const rawBuffer = await readFile(rawFilePath);

  return new NextResponse(new Uint8Array(rawBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
