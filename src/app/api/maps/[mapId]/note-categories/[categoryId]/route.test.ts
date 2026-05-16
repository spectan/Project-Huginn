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
  noteCategoryDelete: vi.fn(async () => ({ id: "category-landmarks" })),
  noteCategoryFindFirst: vi.fn(async () => ({
    color: null,
    id: "category-landmarks",
    markerShape: "circle",
    mapId: "map-1",
    name: "Landmarks",
    pipSize: 3
  })),
  noteCategoryUpdate: vi.fn(async () => ({
    color: "#00ffaa",
    id: "category-landmarks",
    markerShape: "triangle",
    name: "Landmarks Renamed",
    pipSize: 6
  })),
  noteCategoryUpsert: vi.fn(async () => ({
    color: null,
    id: "category-general",
    markerShape: "circle",
    name: "General",
    pipSize: 3
  })),
  noteUpdateMany: vi.fn(async () => ({ count: 2 })),
  transaction: vi.fn(async (callback: unknown) => {
    if (typeof callback === "function") {
      return await callback({
        note: {
          updateMany: mocks.noteUpdateMany
        },
        noteCategory: {
          delete: mocks.noteCategoryDelete,
          update: mocks.noteCategoryUpdate,
          upsert: mocks.noteCategoryUpsert
        }
      });
    }

    return null;
  })
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    auditEvent: {
      create: mocks.auditCreate
    },
    map: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; isActive: boolean } }) => (
        where.id === "map-1" && where.isActive ? mocks.map : null
      ))
    },
    noteCategory: {
      findFirst: mocks.noteCategoryFindFirst
    }
  }
}));

import { DELETE, PATCH } from "./route";

describe("PATCH /api/maps/[mapId]/note-categories/[categoryId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "writer-1",
      isAdmin: false
    };
    mocks.map = { id: "map-1" };
  });

  it("allows approved writers to rename shared note categories by name only", async () => {
    const response = await PATCH(createCategoryRequest({
      name: "Landmarks Renamed"
    }, "PATCH"), {
      params: Promise.resolve({ categoryId: "category-landmarks", mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({
      category: {
        color: "#00ffaa",
        id: "category-landmarks",
        markerShape: "triangle",
        name: "Landmarks Renamed",
        pipSize: 6
      }
    });
    expect(response.status).toBe(200);
    expect(mocks.noteCategoryUpdate).toHaveBeenCalledWith({
      data: {
        name: "Landmarks Renamed"
      },
      where: { id: "category-landmarks" }
    });
    expect(mocks.noteUpdateMany).toHaveBeenCalledWith({
      data: { category: "Landmarks Renamed" },
      where: { category: "Landmarks", mapId: "map-1" }
    });
  });
});

describe("DELETE /api/maps/[mapId]/note-categories/[categoryId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "writer-1",
      isAdmin: false
    };
    mocks.map = { id: "map-1" };
  });

  it("requires admin access to delete note categories", async () => {
    const response = await DELETE(createCategoryRequest(null, "DELETE"), {
      params: Promise.resolve({ categoryId: "category-landmarks", mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(response.status).toBe(403);
    expect(mocks.noteCategoryDelete).not.toHaveBeenCalled();
  });

  it("lets admins delete categories and reassign notes to General", async () => {
    mocks.currentViewer = {
      accessLevel: "READ",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };

    const response = await DELETE(createCategoryRequest(null, "DELETE"), {
      params: Promise.resolve({ categoryId: "category-landmarks", mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({
      category: {
        id: "category-landmarks",
        reassignedTo: "General"
      }
    });
    expect(response.status).toBe(200);
    expect(mocks.noteCategoryUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        name: "General"
      })
    }));
    expect(mocks.noteUpdateMany).toHaveBeenCalledWith({
      data: { category: "General" },
      where: { category: "Landmarks", mapId: "map-1" }
    });
    expect(mocks.noteCategoryDelete).toHaveBeenCalledWith({
      where: { id: "category-landmarks" }
    });
  });
});

function createCategoryRequest(body: unknown, method: "DELETE" | "PATCH"): Request {
  return new Request("http://localhost/api/maps/map-1/note-categories/category-landmarks", {
    body: body === null ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    },
    method
  });
}
