import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import {
  boostChromaImage,
  extractWatermark,
  tryExtractWatermark,
} from "@/lib/watermark/extract";

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  if (!(imageFile instanceof Blob)) {
    return NextResponse.json({ error: "Image is required" }, { status: 400 });
  }

  const mapId = formData.get("mapId");
  if (typeof mapId !== "string" || mapId.length === 0) {
    return NextResponse.json({ error: "Map is required" }, { status: 400 });
  }

  const userId = formData.get("userId");
  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

  let best: {
    found: boolean;
    username: string | null;
    userId: string | null;
    confidence: number;
    syncConfidence: number;
    softConfidence: number;
    syncSoftConfidence: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    previewImage: string | null;
  } = {
    found: false,
    username: null,
    userId: null,
    confidence: 0,
    syncConfidence: 0,
    softConfidence: 0,
    syncSoftConfidence: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    previewImage: null,
  };

  // Always produce a saturation-boosted rendering so the admin can visually
  // confirm the chroma pattern alongside the automated correlation score.
  try {
    const boosted = await boostChromaImage(imageBuffer, 8);
    best.previewImage = `data:image/png;base64,${boosted.toString("base64")}`;
  } catch {
    // Preview is best-effort; detection still works without it.
  }

  if (typeof userId === "string" && userId.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, watermarkNumber: true },
    });

    if (user !== null && user.watermarkNumber !== null) {
      const result = await extractWatermark(imageBuffer, {
        mapId,
        userId: user.id,
        watermarkNumber: user.watermarkNumber,
      });

      best = {
        found: result.found,
        username: user.username,
        userId: result.userId,
        confidence: result.confidence,
        syncConfidence: result.syncConfidence,
        softConfidence: result.softConfidence,
        syncSoftConfidence: result.syncSoftConfidence,
        scale: result.scale,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        previewImage: best.previewImage,
      };
    }
  } else {
    const permissions = await prisma.userMapPermission.findMany({
      where: { mapId },
      select: { userId: true },
    });
    const permissionUserIds = new Set(permissions.map((p) => p.userId));
    permissionUserIds.add(viewer.id); // admins may also have watermarked images

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(permissionUserIds) } },
      select: { id: true, username: true, watermarkNumber: true },
    });
    const usersById = new Map(users.map((u) => [u.id, u.username]));
    const candidates = users
      .filter((u) => u.watermarkNumber !== null)
      .map((u) => ({ userId: u.id, watermarkNumber: u.watermarkNumber! }));

    const result = await tryExtractWatermark(imageBuffer, {
      mapId,
      candidates,
    });

    if (result.found) {
      best = {
        found: true,
        username: result.userId ? usersById.get(result.userId) ?? null : null,
        userId: result.userId,
        confidence: result.confidence,
        syncConfidence: result.syncConfidence,
        softConfidence: result.softConfidence,
        syncSoftConfidence: result.syncSoftConfidence,
        scale: result.scale,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        previewImage: best.previewImage,
      };
    } else {
      best = {
        found: false,
        username: null,
        userId: null,
        confidence: result.confidence,
        syncConfidence: result.syncConfidence,
        softConfidence: result.softConfidence,
        syncSoftConfidence: result.syncSoftConfidence,
        scale: result.scale,
        offsetX: result.offsetX,
        offsetY: result.offsetY,
        previewImage: best.previewImage,
      };
    }
  }

  return NextResponse.json(best);
}
