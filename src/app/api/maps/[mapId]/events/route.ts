import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canReadMap } from "@/lib/domain/permissions";
import { findActiveMap } from "@/lib/markers/database";
import { fetchOfficialEventFeed, getOfficialFeedUrl } from "@/lib/events/event-feed";
import { EVENT_FEED_DISPLAY_LIMIT, listEventsForMap } from "@/lib/events/database";
import type { WurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();
  const { mapId } = await context.params;

  if (viewer === null || !canReadMap(viewer, mapId)) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const storedEvents = await listEventsForMap(map.id);

  if (storedEvents.length > 0) {
    return NextResponse.json({
      feed: buildFeed(storedEvents, new Date().toISOString(), getOfficialFeedUrl(map.name) ?? "")
    });
  }

  const freshFeed = await fetchOfficialEventFeed(map.name);

  if (freshFeed === null) {
    return NextResponse.json({ error: "Event feed is unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    feed: buildFeed(freshFeed.events.slice(0, EVENT_FEED_DISPLAY_LIMIT), freshFeed.fetchedAt, freshFeed.sourceUrl)
  });
}

function buildFeed(
  events: { id: string; message: string; timestamp: number }[],
  fetchedAt: string,
  sourceUrl: string
): WurmMapsEventFeed {
  return {
    events: events.map((event) => ({
      id: event.id,
      kind: "event",
      label: "Event",
      message: event.message,
      subtype: null,
      timestamp: event.timestamp
    })),
    fetchedAt,
    serverStatus: { status: "unknown", uptimeSeconds: null, weather: null, wurmTime: null },
    sourceUrl
  };
}
