const OFFICIAL_EVENT_FEED_URLS: Record<string, string> = {
  Affliction: "http://affliction.wurmonline.com/battles/server_feed.xml",
  Cadence: "https://cadence.game.wurmonline.com/battles/server_feed.xml",
  Celebration: "https://celebration.wurmonline.com/battles/server_feed.xml",
  Chaos: "http://chaos.game.wurmonline.com/battles/server_feed.xml",
  Defiance: "https://defiance.game.wurmonline.com/battles/server_feed.xml",
  Deliverance: "http://deliverance.game.wurmonline.com/battles/server_feed.xml",
  Desertion: "http://desertion.wurmonline.com/battles/server_feed.xml",
  Elevation: "http://elevation.wurmonline.com/battles/server_feed.xml",
  Exodus: "http://exodus.game.wurmonline.com/battles/server_feed.xml",
  Harmony: "https://harmony.game.wurmonline.com/battles/server_feed.xml",
  Independence: "https://independence.game.wurmonline.com/battles/server_feed.xml",
  Melody: "https://melody.game.wurmonline.com/battles/server_feed.xml",
  Pristine: "http://pristine.game.wurmonline.com/battles/server_feed.xml",
  Release: "http://release.game.wurmonline.com/battles/server_feed.xml",
  Serenity: "http://serenity.wurmonline.com/battles/server_feed.xml",
  Xanadu: "http://xanadu.game.wurmonline.com/battles/server_feed.xml"
};

const DEFAULT_EVENT_FEED_TIMEOUT_MS = 5000;
const MAX_EVENT_FEED_TIMEOUT_MS = 30000;
const MAX_EVENTS_PER_SERVER = 100;
const EVENT_FEED_DISPLAY_LIMIT = 30;

export type OfficialEvent = {
  id: string;
  message: string;
  timestamp: number;
};

export type OfficialEventFeed = {
  events: OfficialEvent[];
  fetchedAt: string;
  sourceUrl: string;
};

export type FetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export async function fetchOfficialEventFeed(
  serverName: string,
  options: FetchOptions = {}
): Promise<OfficialEventFeed | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = getOfficialFeedUrl(serverName);

  if (sourceUrl === null) {
    return null;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), getEventFeedTimeoutMs());

  try {
    const response = await fetchImpl(sourceUrl, {
      cache: "no-store",
      signal: abortController.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const events = parseEventFeedXml(xml);

    return {
      events: events.slice(0, EVENT_FEED_DISPLAY_LIMIT),
      fetchedAt: now().toISOString(),
      sourceUrl
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseEventFeedXml(xml: string): OfficialEvent[] {
  const events: OfficialEvent[] = [];
  const messageRegex = /<message\s+text="([^"]*)"\s+time="(\d+)"\s*\/>/g;
  let match;

  while ((match = messageRegex.exec(xml)) !== null) {
    const message = decodeXmlEntities(match[1] ?? "");
    const timestamp = Number.parseInt(match[2] ?? "0", 10);

    if (message !== "" && Number.isFinite(timestamp)) {
      events.push({
        id: `${timestamp}-${events.length}`,
        message,
        timestamp
      });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}

export function getOfficialFeedUrl(serverName: string): string | null {
  return OFFICIAL_EVENT_FEED_URLS[serverName] ?? null;
}

export function getEventFeedTimeoutMs(): number {
  const configured = Number.parseInt(process.env.WURMMAPS_EVENT_FEED_TIMEOUT_MS ?? "", 10);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_EVENT_FEED_TIMEOUT_MS;
  }

  return Math.min(configured, MAX_EVENT_FEED_TIMEOUT_MS);
}

export { MAX_EVENTS_PER_SERVER, EVENT_FEED_DISPLAY_LIMIT };

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
