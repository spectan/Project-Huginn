import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isolateChromaImage: vi.fn(),
  currentViewer: null as null | {
    accessLevel: "WRITE";
    approvalStatus: "APPROVED" | "PENDING";
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

const approvedAdmin = { accessLevel: "WRITE", approvalStatus: "APPROVED", id: "admin-1", isAdmin: true } as const;

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

  it("requires the admin to be approved", async () => {
    mocks.currentViewer = {
      accessLevel: "WRITE",
      approvalStatus: "PENDING",
      id: "admin-1",
      isAdmin: true
    };

    const response = await POST(createRevealRequest(true));

    expect(response.status).toBe(403);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("rejects an oversized content-length before reading the body", async () => {
    mocks.currentViewer = approvedAdmin;
    const request = createRevealRequest(true, { contentLength: String(25 * 1024 * 1024) });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("rejects an image file larger than 20 MB", async () => {
    mocks.currentViewer = approvedAdmin;

    const response = await POST(createRevealRequest(true, { imageBytes: 20 * 1024 * 1024 + 1 }));

    await expect(response.json()).resolves.toEqual({ error: "Image must be 20 MB or smaller" });
    expect(response.status).toBe(413);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("rejects requests without an image", async () => {
    mocks.currentViewer = approvedAdmin;

    const response = await POST(createRevealRequest(false));

    await expect(response.json()).resolves.toEqual({ error: "Image is required" });
    expect(response.status).toBe(400);
    expect(mocks.isolateChromaImage).not.toHaveBeenCalled();
  });

  it("returns the enhanced preview as a data URL", async () => {
    mocks.currentViewer = approvedAdmin;

    const response = await POST(createRevealRequest(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preview: `data:image/png;base64,${Buffer.from("isolated-png").toString("base64")}`
    });
    expect(mocks.isolateChromaImage).toHaveBeenCalledTimes(1);
    expect(mocks.isolateChromaImage.mock.calls[0]?.[0]).toBeInstanceOf(Buffer);
  });

  it("returns a null preview when enhancement fails", async () => {
    mocks.currentViewer = approvedAdmin;
    mocks.isolateChromaImage.mockRejectedValue(new Error("not an image"));

    const response = await POST(createRevealRequest(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ preview: null });
  });
});

function createRevealRequest(
  withImage: boolean,
  { contentLength = null, imageBytes = 3 }: { contentLength?: string | null; imageBytes?: number } = {}
): Request {
  const formData = new FormData();
  if (withImage) {
    formData.append("image", new Blob([new Uint8Array(imageBytes)], { type: "image/png" }), "shot.png");
  }

  // Route handlers only consume request.formData(); passing a real Request
  // would round-trip the Blob through undici's parser, which returns a
  // cross-realm File in the jsdom test environment and breaks instanceof.
  return {
    formData: vi.fn(async () => formData),
    headers: new Headers(contentLength === null ? {} : { "content-length": contentLength })
  } as unknown as Request;
}
