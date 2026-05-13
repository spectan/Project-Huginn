import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { findActiveMap } from "@/lib/markers/database";
import { fetchWurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canReadMap(viewer)) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const { mapId } = await context.params;
  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const result = await fetchWurmMapsEventFeed(map.name);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ feed: result.value });
}
