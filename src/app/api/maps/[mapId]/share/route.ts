import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createShareDependencies } from "@/lib/share/database";
import { createShareLink } from "@/lib/share/share-service";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const body = await readJson(request);
  const { mapId } = await context.params;
  const result = await createShareLink(
    {
      actor: viewer,
      expiresInHours: body?.expiresInHours,
      layerId: body?.layerId,
      mapId
    },
    createShareDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
  }

  return NextResponse.json(
    {
      expiresAt: result.value.expiresAt.toISOString(),
      url: `/share/${result.value.token}`
    },
    { status: 201 }
  );
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

function getErrorStatus(error: string): number {
  if (error === "Read access is required") {
    return 403;
  }

  if (error === "Map was not found") {
    return 404;
  }

  return 400;
}
