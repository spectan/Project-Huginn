import { beforeEach, describe, expect, it, vi } from "vitest";

type TestViewer = {
  accessLevel: "WRITE";
  approvalStatus: "APPROVED";
  id: string;
  isAdmin: boolean;
};

const mocks = vi.hoisted(() => ({
  currentViewer: null as TestViewer | null,
  deleteAlert: vi.fn()
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  deleteAlert: mocks.deleteAlert
}));

import { DELETE } from "./route";

const adminViewer: TestViewer = {
  accessLevel: "WRITE",
  approvalStatus: "APPROVED",
  id: "admin-1",
  isAdmin: true
};

const context = {
  params: Promise.resolve({ id: "alert-1" })
};

describe("DELETE /api/admin/alerts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = adminViewer;
    mocks.deleteAlert.mockResolvedValue({ ok: true, value: null });
  });

  it("requires admin access", async () => {
    mocks.currentViewer = null;

    const response = await DELETE(new Request("http://localhost/api/admin/alerts/alert-1", { method: "DELETE" }), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(mocks.deleteAlert).not.toHaveBeenCalled();

    mocks.currentViewer = { ...adminViewer, isAdmin: false };

    const nonAdminResponse = await DELETE(new Request("http://localhost/api/admin/alerts/alert-1", { method: "DELETE" }), context);

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.deleteAlert).not.toHaveBeenCalled();
  });

  it("deletes the alert", async () => {
    const response = await DELETE(new Request("http://localhost/api/admin/alerts/alert-1", { method: "DELETE" }), context);

    expect(response.status).toBe(200);
    expect(mocks.deleteAlert).toHaveBeenCalledWith("alert-1");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("maps a missing alert to a 404 response", async () => {
    mocks.deleteAlert.mockResolvedValue({ ok: false, error: "Alert was not found" });

    const response = await DELETE(new Request("http://localhost/api/admin/alerts/alert-1", { method: "DELETE" }), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Alert was not found" });
  });
});
