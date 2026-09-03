import { describe, expect, it, vi } from "vitest";
import {
  identifyCanaryLeaks,
  type CanaryIdentifyDependencies
} from "./canary-identify-service";
import type { CanaryRecord } from "./canary-service";

const canaryRows: CanaryRecord[] = [
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

function createDependencies(overrides: Partial<CanaryIdentifyDependencies> = {}) {
  const dependencies: CanaryIdentifyDependencies = {
    findMapNamesByIds: vi.fn(async (mapIds: string[]) =>
      mapIds.map((id) => ({ id, name: `Map ${id}` }))
    ),
    findUsernamesByIds: vi.fn(async (userIds: string[]) =>
      userIds.map((id) => ({ id, username: `User ${id}` }))
    ),
    listAllCanaryMarkers: vi.fn(async () => canaryRows),
    ...overrides
  };

  return dependencies;
}

describe("identifyCanaryLeaks", () => {
  it("returns no matches without touching the database when no signals are found", async () => {
    const dependencies = createDependencies();

    const result = await identifyCanaryLeaks("no markers in here", dependencies);

    expect(result).toEqual({ ok: true, value: { matches: [] } });
    expect(dependencies.listAllCanaryMarkers).not.toHaveBeenCalled();
  });

  it("matches a leaked JSON dump against stored canary payloads", async () => {
    const dependencies = createDependencies();
    const text = JSON.stringify([
      { id: "canary-a", type: "tower", x: 111, y: 222 },
      { id: "canary-b", type: "note", x: 333, y: 444 }
    ]);

    const result = await identifyCanaryLeaks(text, dependencies);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.matches).toEqual([
      {
        hits: [
          { slot: 0, type: "tower", x: 111, y: 222 },
          { slot: 1, type: "note", x: 333, y: 444 }
        ],
        mapId: "map-1",
        mapName: "Map map-1",
        userId: "user-1",
        username: "User user-1"
      }
    ]);
    expect(dependencies.findUsernamesByIds).toHaveBeenCalledWith(["user-1"]);
    expect(dependencies.findMapNamesByIds).toHaveBeenCalledWith(["map-1"]);
  });

  it("matches on coordinates and sorts matches by hit count descending", async () => {
    const dependencies = createDependencies();
    const text = JSON.stringify([
      { x: 111, y: 222 },
      { x: 333, y: 444 },
      { x: 555, y: 666 }
    ]);

    const result = await identifyCanaryLeaks(text, dependencies);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.matches.map((match) => match.userId)).toEqual(["user-1", "user-2"]);
    expect(result.value.matches[0]?.hits).toHaveLength(2);
    expect(result.value.matches[1]?.hits).toHaveLength(1);
  });

  it("falls back to the raw id when the user or map lookup misses", async () => {
    const dependencies = createDependencies({
      findMapNamesByIds: vi.fn(async () => []),
      findUsernamesByIds: vi.fn(async () => [])
    });
    const text = JSON.stringify([{ id: "canary-c", x: 555, y: 666 }]);

    const result = await identifyCanaryLeaks(text, dependencies);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.matches[0]?.username).toBe("user-2");
    expect(result.value.matches[0]?.mapName).toBe("map-2");
  });

  it("returns empty matches when no canary rows line up", async () => {
    const dependencies = createDependencies();
    const text = JSON.stringify([{ id: "unrelated", x: 1, y: 2 }]);

    const result = await identifyCanaryLeaks(text, dependencies);

    expect(result).toEqual({ ok: true, value: { matches: [] } });
    expect(dependencies.listAllCanaryMarkers).toHaveBeenCalledTimes(1);
    expect(dependencies.findUsernamesByIds).not.toHaveBeenCalled();
  });
});
