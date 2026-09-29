import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disbandDeedMarker: vi.fn(),
  viewer: { id: "user-1" } as null | { id: string }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.viewer)
}));

vi.mock("@/lib/markers/database", () => ({
  createMarkerDependencies: vi.fn(() => ({}))
}));

vi.mock("@/lib/markers/marker-service", () => ({
  disbandDeedMarker: mocks.disbandDeedMarker
}));

vi.mock("@/lib/network/client-ip", () => ({
  getClientIp: vi.fn(() => "127.0.0.1")
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/markers/deed/deed-1/disband", { method: "POST" });
}

const context = { params: Promise.resolve({ markerId: "deed-1" }) };

describe("POST /api/markers/deed/[markerId]/disband", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { id: "user-1" };
  });

  it("requires a signed-in viewer", async () => {
    mocks.viewer = null;

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.disbandDeedMarker).not.toHaveBeenCalled();
  });

  it.each([
    ["Write access is required", 403],
    ["Marker was not found", 404],
    ["Title is required", 400]
  ])("maps error %s to %i", async (error, status) => {
    mocks.disbandDeedMarker.mockResolvedValue({ ok: false, error });

    const response = await POST(request(), context);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("returns the conversion on success", async () => {
    mocks.disbandDeedMarker.mockResolvedValue({ ok: true, value: { deletedMarkerId: "deed-1" } });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deletedMarkerId: "deed-1" });
  });
});
