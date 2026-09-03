import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { identifyCanaryLeaks } from "@/lib/canaries/canary-identify-service";
import { createCanaryDependencies } from "@/lib/canaries/database";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const canaryDependencies = createCanaryDependencies();

  const result = await identifyCanaryLeaks(text, {
    findMapNamesByIds: async (mapIds) =>
      prisma.map.findMany({
        select: { id: true, name: true },
        where: { id: { in: mapIds } }
      }),
    findUsernamesByIds: async (userIds) =>
      prisma.user.findMany({
        select: { id: true, username: true },
        where: { id: { in: userIds } }
      }),
    listAllCanaryMarkers: canaryDependencies.listAllCanaryMarkers
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.value);
}
