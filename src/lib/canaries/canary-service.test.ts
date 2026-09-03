import { describe, expect, it } from "vitest";
import {
  CANARY_MARKERS_PER_MAP,
  generateCanaryMarkers,
  getOrCreateCanaries,
  type CanaryDependencies,
  type CanaryRecord
} from "./canary-service";

const bounds = { heightPx: 2048, widthPx: 2048 };

function createCanaryRecord(slot: number, payload: unknown): CanaryRecord {
  return {
    id: `canary-${slot}`,
    mapId: "map-1",
    payload,
    slot,
    userId: "user-1"
  };
}

describe("generateCanaryMarkers", () => {
  it("generates deterministic markers within the map bounds", () => {
    const first = generateCanaryMarkers({ mapId: "map-1", userId: "user-1" }, bounds);
    const second = generateCanaryMarkers({ mapId: "map-1", userId: "user-1" }, bounds);

    expect(first).toHaveLength(CANARY_MARKERS_PER_MAP);
    expect(first.map((marker) => ({ ...marker.payload, id: "fixed" }))).toEqual(
      second.map((marker) => ({ ...marker.payload, id: "fixed" }))
    );

    for (const { payload, slot } of first) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(CANARY_MARKERS_PER_MAP);
      expect(payload.x).toBeGreaterThan(0);
      expect(payload.x).toBeLessThan(bounds.widthPx);
      expect(payload.y).toBeGreaterThan(0);
      expect(payload.y).toBeLessThan(bounds.heightPx);
    }
  });
});

describe("getOrCreateCanaries", () => {
  it("generates and persists canaries when none exist", async () => {
    const created: CanaryRecord[] = [];
    const dependencies: CanaryDependencies = {
      listCanaryMarkers: async () => [],
      createCanaryMarkers: async ({ markers }) => {
        created.push(...markers.map((marker) => createCanaryRecord(marker.slot, marker.payload)));
        return created;
      }
    };

    const canaries = await getOrCreateCanaries(
      { mapId: "map-1", userId: "user-1" },
      bounds,
      dependencies
    );

    expect(created).toHaveLength(CANARY_MARKERS_PER_MAP);
    expect(canaries).toEqual(created.map((record) => record.payload));
  });

  it("reuses existing canaries without creating new ones", async () => {
    const existing = [
      createCanaryRecord(0, { id: "a", type: "note", x: 1, y: 2 }),
      createCanaryRecord(1, { id: "b", type: "camp", x: 3, y: 4 }),
      createCanaryRecord(2, { id: "c", type: "tower", x: 5, y: 6 })
    ];
    const dependencies: CanaryDependencies = {
      listCanaryMarkers: async () => existing,
      createCanaryMarkers: async () => {
        throw new Error("must not be called");
      }
    };

    const canaries = await getOrCreateCanaries(
      { mapId: "map-1", userId: "user-1" },
      bounds,
      dependencies
    );

    expect(canaries).toEqual(existing.map((record) => record.payload));
  });

  it("falls back to listing when a concurrent request created the canaries first", async () => {
    const raced = [
      createCanaryRecord(0, { id: "a", type: "note", x: 1, y: 2 }),
      createCanaryRecord(1, { id: "b", type: "camp", x: 3, y: 4 }),
      createCanaryRecord(2, { id: "c", type: "tower", x: 5, y: 6 })
    ];
    let listCalls = 0;
    const dependencies: CanaryDependencies = {
      listCanaryMarkers: async () => {
        listCalls += 1;
        return listCalls === 1 ? [] : raced;
      },
      createCanaryMarkers: async () => {
        throw new Error("unique constraint violation");
      }
    };

    const canaries = await getOrCreateCanaries(
      { mapId: "map-1", userId: "user-1" },
      bounds,
      dependencies
    );

    expect(canaries).toEqual(raced.map((record) => record.payload));
  });

  it("skips stored payloads that are not workspace markers", async () => {
    const existing = [
      createCanaryRecord(0, { id: "a", type: "note", x: 1, y: 2 }),
      createCanaryRecord(1, null),
      createCanaryRecord(2, "garbage")
    ];
    const dependencies: CanaryDependencies = {
      listCanaryMarkers: async () => existing,
      createCanaryMarkers: async () => {
        throw new Error("must not be called");
      }
    };

    const canaries = await getOrCreateCanaries(
      { mapId: "map-1", userId: "user-1" },
      bounds,
      dependencies
    );

    expect(canaries).toEqual([{ id: "a", type: "note", x: 1, y: 2 }]);
  });
});
