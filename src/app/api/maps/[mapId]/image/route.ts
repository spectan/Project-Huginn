import { NextResponse } from "next/server";
import { join } from "path";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";
import { createShareDependencies } from "@/lib/share/database";
import { resolveShareLink, SHARE_LINK_INVALID_MESSAGE } from "@/lib/share/share-service";
import { embedWatermark } from "@/lib/watermark/embed";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mapId: string }> }
) {
  const viewer = await getCurrentViewer();
  const { mapId } = await params;
  const { searchParams } = new URL(request.url);
  const layerId = searchParams.get("layer") ?? undefined;

  let watermarkUserId: string;
  let watermarkNumber: number;

  if (viewer !== null) {
    if (!canReadMap(viewer, mapId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: viewer.id },
      select: { watermarkNumber: true },
    });

    if (user === null || user.watermarkNumber === null) {
      return NextResponse.json({ error: "User watermark number missing" }, { status: 500 });
    }

    watermarkUserId = viewer.id;
    watermarkNumber = user.watermarkNumber;
  } else {
    const shareToken = searchParams.get("share");

    if (shareToken === null || shareToken.length === 0) {
      return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
    }

    const shareResult = await resolveShareLink(shareToken, createShareDependencies());

    if (!shareResult.ok || shareResult.value.link.mapId !== mapId) {
      return NextResponse.json({ error: SHARE_LINK_INVALID_MESSAGE }, { status: 401 });
    }

    const creator = shareResult.value.link.createdBy;

    if (creator.watermarkNumber === null) {
      return NextResponse.json({ error: "User watermark number missing" }, { status: 500 });
    }

    watermarkUserId = creator.id;
    watermarkNumber = creator.watermarkNumber;
  }

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

  const watermarked = await embedWatermark(
    rawFilePath,
    { mapId, userId: watermarkUserId, layerId: resolvedLayerId, watermarkNumber },
    { cache: true }
  );

  return new NextResponse(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
