import { NextResponse } from "next/server";
import { resolve, sep } from "path";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";
import { createShareDependencies } from "@/lib/share/database";
import { resolveShareLink, SHARE_LINK_INVALID_MESSAGE } from "@/lib/share/share-service";
import { embedWatermark } from "@/lib/watermark/embed";

// Raw (unwatermarked) layer images live outside public/ so Next never serves
// them directly; DB imagePath values ("/maps/<file>.png") resolve under here.
const MAP_IMAGE_ROOT = "map-images";

function resolveMapImagePath(imagePath: string): string | null {
  if (imagePath.split(/[\\/]/).includes("..")) {
    return null;
  }

  const baseDir = resolve(process.cwd(), MAP_IMAGE_ROOT);
  const filePath = resolve(baseDir, `.${imagePath.startsWith("/") ? "" : "/"}${imagePath}`);

  return filePath.startsWith(baseDir + sep) ? filePath : null;
}

function isMissingFileError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

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

  // A share token takes precedence over any session: share visitors must get
  // the exact same response whether or not they are signed in.
  const shareToken = searchParams.get("share");

  if (shareToken !== null && shareToken.length > 0) {
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
  } else if (viewer !== null) {
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
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const map = await prisma.map.findUnique({
    select: { imagePath: true, isActive: true },
    where: { id: mapId },
  });
  if (map === null || !map.isActive) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  let imagePath: string | null = map.imagePath;
  let resolvedLayerId = `${mapId}:default`;

  if (layerId !== undefined && layerId.length > 0) {
    const layer = await prisma.mapLayer.findFirst({
      where: { id: layerId, mapId },
    });
    if (layer === null) {
      return NextResponse.json({ error: "Layer not found" }, { status: 404 });
    }
    imagePath = layer.imagePath;
    resolvedLayerId = layer.id;
  }

  if (imagePath === null || imagePath.length === 0) {
    return NextResponse.json({ error: "No image configured" }, { status: 404 });
  }

  const rawFilePath = resolveMapImagePath(imagePath);

  if (rawFilePath === null) {
    return NextResponse.json({ error: "No image configured" }, { status: 404 });
  }

  let watermarked: Buffer;

  try {
    watermarked = await embedWatermark(
      rawFilePath,
      { userId: watermarkUserId, layerId: resolvedLayerId, watermarkNumber },
      { cache: true }
    );
  } catch (error) {
    if (isMissingFileError(error)) {
      return NextResponse.json({ error: "Map image not found" }, { status: 404 });
    }

    throw error;
  }

  return new NextResponse(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
