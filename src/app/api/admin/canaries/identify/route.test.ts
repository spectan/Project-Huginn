import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/domain/result";

const mocks = vi.hoisted(() => ({
  currentViewer: null as null | {
    accessLevel: "WRITE";
    approvalStatus: "APPROVED";
    id: string;
    isAdmin: boolean;
  },
  identifyCanaryLeaks: vi.fn(),
  listAllCanaryMarkers: vi.fn(async () => []),
  mapFindMany: vi.fn(async () => []),
  userFindMany: vi.fn(async () => [])
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/canaries/canary-identify-service", () => ({
  identifyCanaryLeaks: mocks.identifyCanaryLeaks
}));

vi.mock("@/lib/canaries/database", () => ({
  createCanaryDependencies: vi.fn(() => ({
    listAllCanaryMarkers: mocks.listAllCanaryMarkers
  }))
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    map: { findMany: mocks.mapFindMany },
    user: { findMany: mocks.userFindMany }
  }
}));

import { POST } from "./route";

function createRequest(body: unknown): Request {
  return {
    json: async () => body
  } as unknown as Request;
}

function createInvalidJsonRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected token");
    }
  } as unknown as Request;
}

describe("POST /api/admin/canaries/identify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };
    mocks.identifyCanaryLeaks.mockResolvedValue(ok({ matches: [] }));
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;
    const anonymousResponse = await POST(createRequest({ text: "dump" }));

    await expect(anonymousResponse.json()).resolves.toEqual({
      error: "Admin access is required"
    });
    expect(anonymousResponse.status).toBe(403);

    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false
    };
    const nonAdminResponse = await POST(createRequest({ text: "dump" }));

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.identifyCanaryLeaks).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies", async () => {
    const response = await POST(createInvalidJsonRequest());

    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(response.status).toBe(400);
  });

  it("rejects missing or empty text", async () => {
    for (const body of [{}, { text: 42 }, { text: "" }, { text: "   " }]) {
      const response = await POST(createRequest(body));

      await expect(response.json()).resolves.toEqual({ error: "Text is required" });
      expect(response.status).toBe(400);
    }
    expect(mocks.identifyCanaryLeaks).not.toHaveBeenCalled();
  });

  it("passes the text to the service with prisma-backed dependencies and returns matches", async () => {
    const matches = [
      {
        hits: [{ slot: 0, type: "tower", x: 111, y: 222 }],
        mapId: "map-1",
        mapName: "Independence",
        userId: "user-1",
        username: "Mako"
      }
    ];
    mocks.identifyCanaryLeaks.mockResolvedValue(ok({ matches }));

    const response = await POST(createRequest({ text: "leaked dump" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ matches });

    expect(mocks.identifyCanaryLeaks).toHaveBeenCalledTimes(1);
    const [text, dependencies] = mocks.identifyCanaryLeaks.mock.calls[0] as unknown as [
      string,
      {
        findMapNamesByIds(ids: string[]): Promise<unknown>;
        findUsernamesByIds(ids: string[]): Promise<unknown>;
        listAllCanaryMarkers(): Promise<unknown>;
      }
    ];
    expect(text).toBe("leaked dump");

    await dependencies.listAllCanaryMarkers();
    expect(mocks.listAllCanaryMarkers).toHaveBeenCalledTimes(1);

    await dependencies.findUsernamesByIds(["user-1"]);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      select: { id: true, username: true },
      where: { id: { in: ["user-1"] } }
    });

    await dependencies.findMapNamesByIds(["map-1"]);
    expect(mocks.mapFindMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: { id: { in: ["map-1"] } }
    });
  });

  it("maps service errors to a 500", async () => {
    mocks.identifyCanaryLeaks.mockResolvedValue({ error: "boom", ok: false });

    const response = await POST(createRequest({ text: "leaked dump" }));

    await expect(response.json()).resolves.toEqual({ error: "boom" });
    expect(response.status).toBe(500);
  });
});
