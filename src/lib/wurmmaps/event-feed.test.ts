import { describe, expect, it, vi } from "vitest";
import {
  WURMMAPS_EVENT_FEED_LIMIT,
  fetchWurmMapsEventFeed,
  normalizeWurmMapsEventFeed
} from "./event-feed";

describe("WurmMaps event feed", () => {
  it("normalizes event sections into one newest-first feed", () => {
    const result = normalizeWurmMapsEventFeed({
      "Deed Events": [
        {
          id: "deed-1",
          message: "The settlement of O&#039;Connor Bay has just been disbanded by Mayor.",
          subtype: "2",
          timestamp: "1778286018",
          type: "1"
        }
      ],
      "General Server Info": [
        {
          servername: "celebration",
          status: "1",
          uptime: "53207"
        }
      ],
      "Global Server Info": [
        {
          wind: "A light breeze is coming from the south.",
          wurmtime: "It is 18:30:03 on day of Awakening."
        }
      ],
      "Mission Events": [
        {
          id: "mission-1",
          message: "Fo&#039;s last mystery has been completed successfully.",
          subtype: "1",
          timestamp: "1778385063",
          type: "2"
        }
      ],
      Rifts: [
        {
          id: "rift-1",
          message: "A new Rift has been reported!",
          subtype: "1",
          timestamp: "1778360346",
          type: "6"
        }
      ]
    }, {
      fetchedAt: new Date("2026-05-13T04:00:00.000Z"),
      sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.fetchedAt).toBe("2026-05-13T04:00:00.000Z");
    expect(result.value.serverStatus).toEqual({
      status: "online",
      uptimeSeconds: 53207,
      weather: "A light breeze is coming from the south.",
      wurmTime: "It is 18:30:03 on day of Awakening."
    });
    expect(result.value.events).toEqual([
      {
        id: "mission-1",
        kind: "mission",
        label: "Mission",
        message: "Fo's last mystery has been completed successfully.",
        subtype: 1,
        timestamp: 1778385063
      },
      {
        id: "rift-1",
        kind: "rift",
        label: "Rift",
        message: "A new Rift has been reported!",
        subtype: 1,
        timestamp: 1778360346
      },
      {
        id: "deed-1",
        kind: "deed",
        label: "Deed",
        message: "The settlement of O'Connor Bay has just been disbanded by Mayor.",
        subtype: 2,
        timestamp: 1778286018
      }
    ]);
  });

  it("keeps only the newest event entries", () => {
    const result = normalizeWurmMapsEventFeed({
      "Deed Events": Array.from({ length: WURMMAPS_EVENT_FEED_LIMIT + 3 }, (_, index) => ({
        id: `deed-${index}`,
        message: `Event ${index}`,
        subtype: "1",
        timestamp: String(1000 + index),
        type: "1"
      }))
    }, {
      fetchedAt: new Date("2026-05-13T04:00:00.000Z"),
      sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.events).toHaveLength(WURMMAPS_EVENT_FEED_LIMIT);
    expect(result.value.events[0]?.id).toBe(`deed-${WURMMAPS_EVENT_FEED_LIMIT + 2}`);
    expect(result.value.events.at(-1)?.id).toBe("deed-3");
  });

  it("fetches the Celebration stat delegate endpoint and validates the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      "Deed Events": [
        {
          id: "deed-1",
          message: "The settlement of Finally Fixing This Bridge has just been disbanded by Rory.",
          subtype: "2",
          timestamp: "1778286018",
          type: "1"
        }
      ]
    }), {
      status: 200
    })) as unknown as typeof fetch;

    const result = await fetchWurmMapsEventFeed("Celebration", {
      fetchImpl: fetchMock,
      now: () => new Date("2026-05-13T04:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration",
      expect.objectContaining({
        cache: "no-store"
      })
    );
  });

  it("returns an error when WurmMaps returns a non-JSON or non-OK response", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", {
      status: 503
    })) as unknown as typeof fetch;

    const result = await fetchWurmMapsEventFeed("Celebration", {
      fetchImpl: fetchMock,
      now: () => new Date("2026-05-13T04:00:00.000Z")
    });

    expect(result).toEqual({
      error: "WurmMaps event feed is unavailable",
      ok: false
    });
  });
});
