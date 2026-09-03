import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareDependencies, ShareLinkRecord } from "@/lib/share/share-service";
import { hashShareToken } from "@/lib/share/share-tokens";

const mocks = vi.hoisted(() => {
  const state = {
    currentViewer: null as null | {
      accessLevel: "READ";
      approvalStatus: "APPROVED";
      id: string;
      isAdmin: false;
      mapPermissions?: readonly { accessLevel: "READ"; isOperator: false; mapId: string }[];
    },
    shareLinks: new Map<string, ShareLinkRecord>(),
    userWatermarkNumbers: new Map<string, number | null>()
  };

  const prisma = {
    map: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "map-1" ? { id: "map-1", imagePath: "maps/map-1-terrain.png" } : null
      )
    },
    mapLayer: {
      findFirst: vi.fn(async () => null)
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (!state.userWatermarkNumbers.has(where.id)) {
          return null;
        }

        return { watermarkNumber: state.userWatermarkNumbers.get(where.id) ?? null };
      })
    }
  };

  const embedWatermark = vi.fn(async () => new Uint8Array([1, 2, 3]));

  const shareDependencies: ShareDependencies = {
    createShareLink: vi.fn(async () => {}),
    findShareLinkWithCreator: vi.fn(async (tokenHash) => state.shareLinks.get(tokenHash) ?? null),
    settings: {
      findMap: vi.fn(async () => null),
      findSettings: vi.fn(async () => null),
      upsertSettings: vi.fn(async ({ settings }) => ({ settings }))
    }
  };

  return {
    embedWatermark,
    prisma,
    shareDependencies,
    state
  };
});

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.state.currentViewer)
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/share/database", () => ({
  createShareDependencies: vi.fn(() => mocks.shareDependencies)
}));

vi.mock("@/lib/watermark/embed", () => ({
  embedWatermark: mocks.embedWatermark
}));

import { GET } from "./route";

describe("GET /api/maps/[mapId]/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.currentViewer = null;
    mocks.state.shareLinks.clear();
    mocks.state.userWatermarkNumbers.clear();
  });

  it("returns 401 when there is no session and no share token", async () => {
    const response = await GET(createImageRequest("/api/maps/map-1/image"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Authentication is required" });
    expect(response.status).toBe(401);
  });

  it("serves the image watermarked for the session viewer", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }]
    };
    mocks.state.userWatermarkNumbers.set("user-1", 4321);

    const response = await GET(createImageRequest("/api/maps/map-1/image"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(mocks.embedWatermark).toHaveBeenCalledWith(
      expect.any(String),
      { mapId: "map-1", userId: "user-1", layerId: "map-1:default", watermarkNumber: 4321 },
      { cache: true }
    );
  });

  it("returns 403 when the session viewer cannot read the map", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: []
    };

    const response = await GET(createImageRequest("/api/maps/map-1/image"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Access denied" });
    expect(response.status).toBe(403);
  });

  it("returns 401 for an unknown share token", async () => {
    const response = await GET(createImageRequest("/api/maps/map-1/image?share=bogus-token"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Share link is invalid or has expired" });
    expect(response.status).toBe(401);
  });

  it("returns 401 when the share link targets a different map", async () => {
    seedShareLink("other-map-token", { mapId: "map-2" });

    const response = await GET(createImageRequest("/api/maps/map-1/image?share=other-map-token"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Share link is invalid or has expired" });
    expect(response.status).toBe(401);
  });

  it("returns 500 when the share link creator has no watermark number", async () => {
    seedShareLink("no-watermark-token", {
      createdBy: { id: "creator-1", watermarkNumber: null }
    });

    const response = await GET(createImageRequest("/api/maps/map-1/image?share=no-watermark-token"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "User watermark number missing" });
    expect(response.status).toBe(500);
  });

  it("serves the image watermarked for the share link creator", async () => {
    seedShareLink("valid-token", {
      createdBy: { id: "creator-1", watermarkNumber: 9876 }
    });

    const response = await GET(createImageRequest("/api/maps/map-1/image?share=valid-token"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(mocks.embedWatermark).toHaveBeenCalledWith(
      expect.any(String),
      { mapId: "map-1", userId: "creator-1", layerId: "map-1:default", watermarkNumber: 9876 },
      { cache: true }
    );
  });

  it("prefers the session credential over a share token", async () => {
    mocks.state.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId: "map-1" }]
    };
    mocks.state.userWatermarkNumbers.set("user-1", 4321);
    seedShareLink("valid-token", {
      createdBy: { id: "creator-1", watermarkNumber: 9876 }
    });

    const response = await GET(createImageRequest("/api/maps/map-1/image?share=valid-token"), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.embedWatermark).toHaveBeenCalledWith(
      expect.any(String),
      { mapId: "map-1", userId: "user-1", layerId: "map-1:default", watermarkNumber: 4321 },
      { cache: true }
    );
  });
});

function seedShareLink(token: string, overrides: Partial<ShareLinkRecord> = {}): void {
  mocks.state.shareLinks.set(hashShareToken(token), {
    createdBy: { id: "creator-1", watermarkNumber: 1111 },
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    layerId: null,
    mapId: "map-1",
    settings: null,
    ...overrides
  });
}

function createImageRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}
