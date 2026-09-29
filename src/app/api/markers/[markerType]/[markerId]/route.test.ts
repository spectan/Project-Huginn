import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMarker: vi.fn(),
  updateMarker: vi.fn(),
  viewer: { id: "user-1" } as null | { id: string }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.viewer)
}));

vi.mock("@/lib/markers/database", () => ({
  createMarkerDependencies: vi.fn(() => ({}))
}));

vi.mock("@/lib/markers/marker-service", () => ({
  deleteMarker: mocks.deleteMarker,
  updateMarker: mocks.updateMarker
}));

vi.mock("@/lib/network/client-ip", () => ({
  getClientIp: vi.fn(() => "127.0.0.1")
}));

import { DELETE, PATCH } from "./route";

const context = {
  params: Promise.resolve({ markerId: "marker-1", markerType: "tower" })
};

function patchRequest() {
  return new Request("http://localhost/api/markers/tower/marker-1", {
    body: JSON.stringify({ type: "tower" }),
    method: "PATCH"
  });
}

describe("/api/markers/[markerType]/[markerId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { id: "user-1" };
  });

  it.each([
    ["Write access is required", 403],
    ["Marker was not found", 404],
    ["Marker type mismatch", 400]
  ])("maps PATCH error %s to %i", async (error, status) => {
    mocks.updateMarker.mockResolvedValue({ ok: false, error });

    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it.each([
    ["Write access is required", 403],
    ["Marker was not found", 404]
  ])("maps DELETE error %s to %i", async (error, status) => {
    mocks.deleteMarker.mockResolvedValue({ ok: false, error });

    const response = await DELETE(new Request("http://localhost/api/markers/tower/marker-1", { method: "DELETE" }), context);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("returns the updated marker on success", async () => {
    mocks.updateMarker.mockResolvedValue({ ok: true, value: { id: "marker-1" } });

    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ marker: { id: "marker-1" } });
  });

  it("rejects unknown marker types before calling the service", async () => {
    const response = await PATCH(patchRequest(), {
      params: Promise.resolve({ markerId: "marker-1", markerType: "castle" })
    });

    expect(response.status).toBe(400);
    expect(mocks.updateMarker).not.toHaveBeenCalled();
  });
});
