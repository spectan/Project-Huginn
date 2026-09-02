import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { extractWatermark } from "@/lib/watermark/extract";

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
  const datestamp = formData.get("datestamp");

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

  let best: {
    found: boolean;
    username: string | null;
    datestamp: string | null;
    confidence: number;
    checksumValid: boolean;
  } = {
    found: false,
    username: null,
    datestamp: null,
    confidence: 0,
    checksumValid: false,
  };

  if (typeof userId === "string" && userId.length > 0 && typeof datestamp === "string" && datestamp.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (user !== null) {
      const result = await extractWatermark(imageBuffer, {
        mapId,
        userId: user.id,
        datestamp,
      });

      if (result.found) {
        best = {
          found: true,
          username: user.username,
          datestamp,
          confidence: result.confidence,
          checksumValid: result.checksumValid,
        };
      }
    }
  } else {
    // Try recent datestamps and all users with access to this map.
    const today = new Date();
    const datestamps: string[] = [];
    for (let offsetDays = 0; offsetDays <= 7; offsetDays++) {
      const date = new Date(today.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      datestamps.push(date.toISOString().slice(0, 10));
    }

    const permissions = await prisma.userMapPermission.findMany({
      where: { mapId },
      select: { userId: true },
    });
    const userIds = new Set(permissions.map((p) => p.userId));
    userIds.add(viewer.id); // admins may also have watermarked images

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, username: true },
    });

    for (const user of users) {
      for (const datestamp of datestamps) {
        const result = await extractWatermark(imageBuffer, {
          mapId,
          userId: user.id,
          datestamp,
        });

        if (result.found && result.confidence > best.confidence) {
          best = {
            found: true,
            username: user.username,
            datestamp,
            confidence: result.confidence,
            checksumValid: result.checksumValid,
          };
        }
      }
    }
  }

  return NextResponse.json(best);
}
