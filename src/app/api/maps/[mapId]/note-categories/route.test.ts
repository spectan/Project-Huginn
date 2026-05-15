import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(async () => ({})),
  currentViewer: null as null | {
    accessLevel: "WRITE" | "READ" | "NONE";
    approvalStatus: "APPROVED" | "PENDING";
    id: string;
    isAdmin: boolean;
  },
  map: null as null | { id: string },
  noteCategoryUpsert: vi.fn(async () => ({ id: "category-1", name: "Landmarks" }))
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: {
      create: mocks.auditCreate
    },
    map: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; isActive: boolean } }) => (
        where.id === "map-1" && where.isActive ? mocks.map : null
      ))
    },
    noteCategory: {
      findMany: vi.fn(async () => []),
      upsert: mocks.noteCategoryUpsert
    }
  }
}));

import { POST } from "./route";

describe("POST /api/maps/[mapId]/note-categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.map = { id: "map-1" };
  });

  it("requires approved admin access", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "PENDING",
      id: "admin-1",
      isAdmin: true
    };

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(response.status).toBe(403);
    expect(mocks.noteCategoryUpsert).not.toHaveBeenCalled();
  });

  it("returns 404 instead of upserting categories for inactive or missing maps", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };
    mocks.map = null;

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Map was not found" });
    expect(response.status).toBe(404);
    expect(mocks.noteCategoryUpsert).not.toHaveBeenCalled();
  });
});

function createCategoryRequest(body: unknown): Request {
  return new Request("http://localhost/api/maps/map-1/note-categories", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
}
