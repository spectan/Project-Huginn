import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  removeAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
  viewer: { approvalStatus: "APPROVED", id: "admin-1", isAdmin: true } as null | Record<string, unknown>
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.viewer)
}));

vi.mock("@/lib/admin/users-database", () => ({
  createAdminUserDependencies: vi.fn(() => ({}))
}));

vi.mock("@/lib/admin/users", () => ({
  removeAdminUser: mocks.removeAdminUser,
  updateAdminUser: mocks.updateAdminUser
}));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ userId: "user-1" }) };

describe("/api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Admin access is required", 403],
    ["User was not found", 404],
    ["Operators cannot grant global admin access", 400]
  ])("maps PATCH error %s to HTTP %i", async (error, status) => {
    mocks.updateAdminUser.mockResolvedValue({ ok: false, error });

    const response = await PATCH(new Request("http://localhost/api/admin/users/user-1", {
      body: JSON.stringify({ isAdmin: false, mapPermissions: [] }),
      method: "PATCH"
    }), context);

    expect(response.status).toBe(status);
  });

  it("returns 404 when deleting a user that no longer exists", async () => {
    mocks.removeAdminUser.mockResolvedValue({ ok: false, error: "User was not found" });

    const response = await DELETE(new Request("http://localhost/api/admin/users/user-1", {
      method: "DELETE"
    }), context);

    expect(response.status).toBe(404);
  });
});
