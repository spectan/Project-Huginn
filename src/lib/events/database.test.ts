import { beforeEach, describe, expect, it, vi } from "vitest";
import { findLatestUniqueSlain } from "./database";

const mocks = vi.hoisted(() => {
  const state = {
    events: [] as Array<{ id: string; mapId: string; message: string; timestamp: number }>
  };

  const eventFindFirst = vi.fn(async (args: {
    orderBy: { timestamp: "asc" | "desc" };
    select: { message: true; timestamp: true };
    where: {
      mapId: string;
      OR: Array<{ message: { contains: string; mode: "insensitive" } }>;
    };
  }) => {
    const needles = args.where.OR.map((clause) => clause.message.contains.toLowerCase());
    const matches = state.events
      .filter((event) => event.mapId === args.where.mapId)
      .filter((event) => needles.some((needle) => event.message.toLowerCase().includes(needle)))
      .sort((a, b) => (args.orderBy.timestamp === "desc"
        ? b.timestamp - a.timestamp
        : a.timestamp - b.timestamp));
    const first = matches[0];

    return first === undefined
      ? null
      : { message: first.message, timestamp: first.timestamp };
  });

  return { eventFindFirst, state };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: {
      findFirst: mocks.eventFindFirst
    }
  }
}));

describe("findLatestUniqueSlain", () => {
  beforeEach(() => {
    mocks.state.events.length = 0;
    mocks.eventFindFirst.mockClear();
  });

  it("returns the most recent slain event for the map", async () => {
    mocks.state.events.push(
      { id: "event-1", mapId: "map-1", message: "Mako slain the Kyklops", timestamp: 1783100000 },
      { id: "event-2", mapId: "map-1", message: "Someone slain the Forest Giant", timestamp: 1783120000 },
      { id: "event-3", mapId: "map-1", message: "Trader Joe has settled Somewhere", timestamp: 1783130000 }
    );

    const result = await findLatestUniqueSlain("map-1");

    expect(result).toEqual({
      message: "Someone slain the Forest Giant",
      timestamp: 1783120000
    });
  });

  it("matches slain case-insensitively", async () => {
    mocks.state.events.push(
      { id: "event-1", mapId: "map-1", message: "Mako SLAIN the Kyklops", timestamp: 1783100000 }
    );

    const result = await findLatestUniqueSlain("map-1");

    expect(result).toEqual({
      message: "Mako SLAIN the Kyklops",
      timestamp: 1783100000
    });
    expect(mocks.eventFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mapId: "map-1",
        OR: [
          { message: { contains: "slain", mode: "insensitive" } },
          { message: { contains: "slayed", mode: "insensitive" } }
        ]
      })
    }));
  });

  it("matches slayed wording used by real unique kill events", async () => {
    mocks.state.events.push(
      { id: "event-1", mapId: "map-1", message: "Blazecraze, Alyeska slayed The venerable red dragon", timestamp: 1783100000 },
      { id: "event-2", mapId: "map-1", message: "Mako slain the Kyklops", timestamp: 1783000000 }
    );

    const result = await findLatestUniqueSlain("map-1");

    expect(result).toEqual({
      message: "Blazecraze, Alyeska slayed The venerable red dragon",
      timestamp: 1783100000
    });
  });

  it("ignores events without slain in the message", async () => {
    mocks.state.events.push(
      { id: "event-1", mapId: "map-1", message: "Trader Joe has settled Somewhere", timestamp: 1783130000 }
    );

    expect(await findLatestUniqueSlain("map-1")).toBeNull();
  });

  it("ignores slain events on other maps", async () => {
    mocks.state.events.push(
      { id: "event-1", mapId: "map-2", message: "Mako slain the Kyklops", timestamp: 1783100000 }
    );

    expect(await findLatestUniqueSlain("map-1")).toBeNull();
  });

  it("returns null when no events exist", async () => {
    expect(await findLatestUniqueSlain("map-1")).toBeNull();
  });
});
