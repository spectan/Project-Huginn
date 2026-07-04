import { describe, expect, it, vi } from "vitest";
import {
  EVENT_FEED_DISPLAY_LIMIT,
  MAX_EVENTS_PER_SERVER,
  fetchOfficialEventFeed,
  getOfficialFeedUrl,
  parseEventFeedXml
} from "./event-feed";

describe("official event feed", () => {
  it("parses XML feed into sorted events", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<server_feed>
  <generated>1783143334</generated>
  <messages>
    <message text="First event" time="1783119350"/>
    <message text="Second event" time="1783120000"/>
    <message text="Event with &quot;quotes&quot; and &amp; ampersand" time="1783100000"/>
  </messages>
</server_feed>`;

    const events = parseEventFeedXml(xml);

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      id: "1783120000-1",
      message: "Second event",
      timestamp: 1783120000
    });
    expect(events[1]).toEqual({
      id: "1783119350-0",
      message: "First event",
      timestamp: 1783119350
    });
    expect(events[2]).toEqual({
      id: "1783100000-2",
      message: 'Event with "quotes" and & ampersand',
      timestamp: 1783100000
    });
  });

  it("returns empty array for invalid XML", () => {
    expect(parseEventFeedXml("")).toEqual([]);
    expect(parseEventFeedXml("<not-a-feed/>")).toEqual([]);
  });

  it("maps server names to official feed URLs", () => {
    expect(getOfficialFeedUrl("Independence")).toBe(
      "https://independence.game.wurmonline.com/battles/server_feed.xml"
    );
    expect(getOfficialFeedUrl("Celebration")).toBe(
      "https://celebration.wurmonline.com/battles/server_feed.xml"
    );
    expect(getOfficialFeedUrl("Harmony")).toBe(
      "https://harmony.game.wurmonline.com/battles/server_feed.xml"
    );
    expect(getOfficialFeedUrl("Unknown")).toBeNull();
  });

  it("fetches and limits events from official feed", async () => {
    const xml = `<server_feed><messages>${Array.from(
      { length: EVENT_FEED_DISPLAY_LIMIT + 5 },
      (_, i) => `<message text="Event ${i}" time="${1783100000 + i}"/>`
    ).join("")}</messages></server_feed>`;

    const fetchMock = vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;

    const result = await fetchOfficialEventFeed("Celebration", {
      fetchImpl: fetchMock,
      now: () => new Date("2026-05-13T04:00:00.000Z")
    });

    expect(result).not.toBeNull();
    expect(result?.events).toHaveLength(EVENT_FEED_DISPLAY_LIMIT);
    expect(result?.fetchedAt).toBe("2026-05-13T04:00:00.000Z");
    expect(result?.sourceUrl).toBe("https://celebration.wurmonline.com/battles/server_feed.xml");
  });

  it("returns null for unknown servers", async () => {
    const result = await fetchOfficialEventFeed("UnknownServer");
    expect(result).toBeNull();
  });

  it("returns null on fetch failure", async () => {
    const fetchMock = vi.fn(async () => new Response("error", { status: 503 })) as unknown as typeof fetch;

    const result = await fetchOfficialEventFeed("Celebration", { fetchImpl: fetchMock });
    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    vi.useFakeTimers();
    process.env.WURMMAPS_EVENT_FEED_TIMEOUT_MS = "50";

    const fetchMock = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;

    const resultPromise = fetchOfficialEventFeed("Celebration", { fetchImpl: fetchMock });
    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).resolves.toBeNull();
    vi.useRealTimers();
  });
});
