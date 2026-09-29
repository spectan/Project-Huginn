import { OFFICIAL_EVENT_FEED_URLS, parseEventFeedEntries } from "../../../scripts/event-feed-shared.mjs";

const DEFAULT_EVENT_FEED_TIMEOUT_MS = 5000;
const MAX_EVENT_FEED_TIMEOUT_MS = 30000;

type OfficialEvent = {
  id: string;
  message: string;
  timestamp: number;
};

type OfficialEventFeed = {
  events: OfficialEvent[];
  fetchedAt: string;
  sourceUrl: string;
};

type FetchOptions = {
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
      events,
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
  return parseEventFeedEntries(xml)
    .map((entry, index) => ({ id: `${entry.timestamp}-${index}`, ...entry }))
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}

export function getOfficialFeedUrl(serverName: string): string | null {
  return OFFICIAL_EVENT_FEED_URLS[serverName] ?? null;
}

function getEventFeedTimeoutMs(): number {
  const configured = Number.parseInt(process.env.WURMMAPS_EVENT_FEED_TIMEOUT_MS ?? "", 10);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_EVENT_FEED_TIMEOUT_MS;
  }

  return Math.min(configured, MAX_EVENT_FEED_TIMEOUT_MS);
}
