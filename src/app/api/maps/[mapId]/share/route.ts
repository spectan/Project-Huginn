import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createShareDependencies } from "@/lib/share/database";
import { createShareLink } from "@/lib/share/share-service";
import { readJson } from "@/lib/http/read-json";
import { MAP_ERROR_STATUSES, getErrorStatus } from "@/lib/http/error-status";

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

  const json = await readJson(request);
  const body = typeof json === "object" && json !== null && !Array.isArray(json)
    ? json as Record<string, unknown>
    : null;
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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, MAP_ERROR_STATUSES) });
  }

  return NextResponse.json(
    {
      expiresAt: result.value.expiresAt.toISOString(),
      url: `/share/${result.value.token}`
    },
    { status: 201 }
  );
}
