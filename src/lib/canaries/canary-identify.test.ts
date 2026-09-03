import { describe, expect, it } from "vitest";
import { extractMarkerSignals, matchCanaries, type CanaryIdentifyRow } from "./canary-identify";

describe("extractMarkerSignals", () => {
  it("extracts ids and coordinates from a JSON array of markers", () => {
    const text = JSON.stringify([
      { id: "abc123", type: "tower", x: 100, y: 200 },
      { id: "def456", type: "note", x: 300, y: 400 }
    ]);

    const signals = extractMarkerSignals(text);

    expect(signals.ids).toEqual(["abc123", "def456"]);
    expect(signals.coordinates).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 400 }
    ]);
  });

  it("extracts signals from nested JSON wrappers", () => {
    const text = JSON.stringify({
      markers: [{ id: "nested-1", x: 12, y: 34 }],
      towers: [{ id: "nested-2", x: 56, y: 78 }]
    });

    const signals = extractMarkerSignals(text);

    expect(signals.ids).toEqual(["nested-1", "nested-2"]);
    expect(signals.coordinates).toEqual([
      { x: 12, y: 34 },
      { x: 56, y: 78 }
    ]);
  });

  it("dedupes repeated ids and coordinates", () => {
    const text = JSON.stringify([
      { id: "dup", x: 10, y: 20 },
      { id: "dup", x: 10, y: 20 },
      { id: "dup", x: 10.0, y: 20 }
    ]);

    const signals = extractMarkerSignals(text);

    expect(signals.ids).toEqual(["dup"]);
    expect(signals.coordinates).toEqual([{ x: 10, y: 20 }]);
  });

  it("returns empty signals for JSON without marker-like content", () => {
    expect(extractMarkerSignals(JSON.stringify({ hello: "world" }))).toEqual({
      coordinates: [],
      ids: []
    });
    expect(extractMarkerSignals("42")).toEqual({ coordinates: [], ids: [] });
  });

  it("falls back to regex extraction for non-JSON text", () => {
    const text =
      'tower at "x": 123, "y": 456 and note at 789, 1011 by cljk3m2n90000abcd1234 last week';

    const signals = extractMarkerSignals(text);

    expect(signals.coordinates).toEqual([
      { x: 123, y: 456 },
      { x: 789, y: 1011 }
    ]);
    expect(signals.ids).toContain("cljk3m2n90000abcd1234");
  });

  it("extracts 25-char hex canary ids from non-JSON text", () => {
    const text = "leaked marker 0123456789abcdef012345678 dumped";

    const signals = extractMarkerSignals(text);

    expect(signals.ids).toContain("0123456789abcdef012345678");
  });

  it("dedupes coordinate styles overlapping in non-JSON text", () => {
    const text = '"x": 123, "y": 456';

    const signals = extractMarkerSignals(text);

    // The plain "123, 456" style overlaps the keyed style; both parse to the
    // same pair and must collapse to one entry.
    expect(signals.coordinates).toEqual([{ x: 123, y: 456 }]);
  });
});

describe("matchCanaries", () => {
  const rows: CanaryIdentifyRow[] = [
    {
      id: "row-1",
      mapId: "map-1",
      payload: { id: "canary-a", type: "tower", x: 111, y: 222 },
      slot: 0,
      userId: "user-1"
    },
    {
      id: "row-2",
      mapId: "map-1",
      payload: { id: "canary-b", type: "note", x: 333, y: 444 },
      slot: 1,
      userId: "user-1"
    },
    {
      id: "row-3",
      mapId: "map-2",
      payload: { id: "canary-c", type: "camp", x: 555, y: 666 },
      slot: 0,
      userId: "user-2"
    }
  ];

  it("matches rows by payload id and groups them per user and map", () => {
    const matches = matchCanaries({ coordinates: [], ids: ["canary-a", "canary-b"] }, rows);

    expect(matches).toEqual([
      {
        hits: [
          { slot: 0, type: "tower", x: 111, y: 222 },
          { slot: 1, type: "note", x: 333, y: 444 }
        ],
        mapId: "map-1",
        userId: "user-1"
      }
    ]);
  });

  it("matches rows by payload coordinates", () => {
    const matches = matchCanaries({ coordinates: [{ x: 555, y: 666 }], ids: [] }, rows);

    expect(matches).toEqual([
      {
        hits: [{ slot: 0, type: "camp", x: 555, y: 666 }],
        mapId: "map-2",
        userId: "user-2"
      }
    ]);
  });

  it("skips malformed payloads and non-matching rows", () => {
    const malformed: CanaryIdentifyRow[] = [
      { id: "row-x", mapId: "map-1", payload: null, slot: 0, userId: "user-9" },
      { id: "row-y", mapId: "map-1", payload: "nope", slot: 1, userId: "user-9" },
      {
        id: "row-z",
        mapId: "map-1",
        payload: { title: "no id or coordinates" },
        slot: 2,
        userId: "user-9"
      }
    ];

    expect(matchCanaries({ coordinates: [{ x: 1, y: 2 }], ids: ["canary-a"] }, malformed)).toEqual(
      []
    );
  });

  it("returns no matches when nothing lines up", () => {
    expect(matchCanaries({ coordinates: [{ x: 1, y: 2 }], ids: ["other"] }, rows)).toEqual([]);
  });
});
