import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/http";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(async () => ({})),
  currentViewer: null as null | {
    accessLevel: "WRITE" | "READ" | "NONE";
    approvalStatus: "APPROVED" | "PENDING";
    id: string;
    isAdmin: boolean;
    mapPermissions?: readonly [{ accessLevel: "WRITE"; isOperator: false; mapId: string }];
  },
  map: null as null | { id: string },
  noteCategoryCreate: vi.fn(async (input: unknown) => {
    void input;

    return {
      color: null,
      id: "category-1",
      markerShape: "circle",
      name: "Landmarks",
      pipSize: 3
    };
  }),
  noteCategoryFindUnique: vi.fn(async (input: unknown) => {
    void input;

    return null as null | {
      color: string | null;
      id: string;
      markerShape: string;
      name: string;
      pipSize: number;
    };
  })
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
      create: mocks.noteCategoryCreate,
      findMany: vi.fn(async () => []),
      findUnique: mocks.noteCategoryFindUnique
    }
  }
}));

import { POST } from "./route";

const approvedAdmin = { accessLevel: "WRITE", approvalStatus: "APPROVED", id: "admin-1", isAdmin: true } as const;

describe("POST /api/maps/[mapId]/note-categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.map = { id: "map-1" };
  });

  it("requires approved write access", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "PENDING",
      id: "admin-1",
      isAdmin: true
    };

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Write access is required" });
    expect(response.status).toBe(403);
    expect(mocks.noteCategoryCreate).not.toHaveBeenCalled();
  });

  it("allows approved writers to create note categories by shared name only", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "writer-1",
      isAdmin: false,
      mapPermissions: [
        { accessLevel: "WRITE", isOperator: false, mapId: "map-1" }
      ]
    };

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({
      category: {
        color: null,
        id: "category-1",
        markerShape: "circle",
        name: "Landmarks",
        pipSize: 3
      }
    });
    expect(response.status).toBe(201);
    expect(mocks.noteCategoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "Landmarks"
      })
    }));
    const createInput = mocks.noteCategoryCreate.mock.calls[0]?.[0] as { data?: unknown } | undefined;
    expect(createInput?.data).not.toHaveProperty("color");
    expect(createInput?.data).not.toHaveProperty("markerShape");
    expect(createInput?.data).not.toHaveProperty("pipSize");
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 200 without a created audit when the category already exists", async () => {
    mocks.currentViewer = approvedAdmin;
    mocks.noteCategoryFindUnique.mockResolvedValueOnce({
      color: "#ff0000",
      id: "category-existing",
      markerShape: "square",
      name: "Landmarks",
      pipSize: 4
    });

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ category: { id: "category-existing" } });
    expect(mocks.noteCategoryCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("returns 200 without a created audit when a concurrent request created the category", async () => {
    mocks.currentViewer = approvedAdmin;
    mocks.noteCategoryCreate.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.noteCategoryFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        color: null,
        id: "category-raced",
        markerShape: "circle",
        name: "Landmarks",
        pipSize: 3
      });

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ category: { id: "category-raced" } });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 instead of creating categories for inactive or missing maps", async () => {
    mocks.currentViewer = approvedAdmin;
    mocks.map = null;

    const response = await POST(createCategoryRequest({ name: "Landmarks" }), {
      params: Promise.resolve({ mapId: "map-1" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Map was not found" });
    expect(response.status).toBe(404);
    expect(mocks.noteCategoryCreate).not.toHaveBeenCalled();
  });
});

const createCategoryRequest = (body: unknown) => jsonRequest("http://localhost/api/maps/map-1/note-categories", "POST", body);
