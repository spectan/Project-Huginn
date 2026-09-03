import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isolateChromaImage: vi.fn(),
  currentViewer: null as null | {
    accessLevel: "WRITE";
    approvalStatus: "APPROVED";
    id: string;
    isAdmin: boolean;
  }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.currentViewer)
}));

vi.mock("@/lib/watermark/enhance", () => ({
  isolateChromaImage: mocks.isolateChromaImage
}));

import { POST } from "./route";

describe("POST /api/admin/watermark-reveal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentViewer = null;
    mocks.isolateChromaImage.mockResolvedValue(Buffer.from("isolated-png"));
  });

  it("requires admin access", async () => {
    const response = await POST(createRevealRequest(true));

    await expect(response.json()).resolves.toEqual({ error: "Admin access is required" });
    expect(response.status).toBe(403);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();

    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "user-1",
      isAdmin: false
    };
    const nonAdminResponse = await POST(createRevealRequest(true));

    expect(nonAdminResponse.status).toBe(403);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("rejects requests without an image", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };

    const response = await POST(createRevealRequest(false));

    await expect(response.json()).resolves.toEqual({ error: "Image is required" });
    expect(response.status).toBe(400);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("returns the enhanced preview as a data URL", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };

    const response = await POST(createRevealRequest(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preview: `data:image/png;base64,${Buffer.from("isolated-png").toString("base64")}`
    });
    expect(mocks.isolateChromaImage).toHaveBeenCalledTimes(1);
    expect(mocks.isolateChromaImage.mock.calls[0]?.[0]).toBeInstanceOf(Buffer);
  });

  it("returns a null preview when enhancement fails", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "APPROVED",
      id: "admin-1",
      isAdmin: true
    };
    mocks.isolateChromaImage.mockRejectedValue(new Error("not an image"));

    const response = await POST(createRevealRequest(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ preview: null });
  });
});

function createRevealRequest(withImage: boolean): Request {
  const formData = new FormData();
  if (withImage) {
    formData.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "shot.png");
  }

  // Route handlers only consume request.formData(); passing a real Request
  // would round-trip the Blob through undici's parser, which returns a
  // cross-realm File in the jsdom test environment and breaks instanceof.
  return {
    formData: async () => formData
  } as unknown as Request;
}
