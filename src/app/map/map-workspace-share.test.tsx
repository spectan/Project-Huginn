import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkspace from "./map-workspace";

const approvedViewer = {
  approvalStatus: "APPROVED",
  isAdmin: true,
  mapPermissions: [],
  pendingApprovalCount: 0,
  permissions: "WRITE",
  username: "Admin"
} as const;

const sharedViewer = {
  approvalStatus: "APPROVED",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ],
  pendingApprovalCount: 0,
  permissions: "READ",
  username: "Shared view"
} as const;

const activeMap = {
  heightPx: 2048,
  id: "map-1",
  imageSrc: "/maps/wurm-map.png",
  layers: [
    {
      heightPx: 2048,
      id: "layer-terrain",
      imageSrc: "/maps/wurm-map.png",
      isDefault: true,
      name: "Terrain",
      widthPx: 2048
    },
    {
      heightPx: 2048,
      id: "layer-topographical",
      imageSrc: "/maps/celebration-topo.png",
      isDefault: false,
      name: "Topographical",
      widthPx: 2048
    }
  ],
  name: "Celebration",
  widthPx: 2048
} as const;

function mockClipboardWrite() {
  const writeText = vi.fn(async () => undefined);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });

  return writeText;
}

describe("MapWorkspace share mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/share/share-token");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 2048
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2048
    });
  });

  it("hides account, settings, selection, event feed, and share chrome in share mode", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      servers: [{ id: "map-1", name: "Celebration" }],
      shareToken: "share-token",
      viewer: sharedViewer
    }));

    expect(screen.getByAltText("Wurm Online map")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search map" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map legend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Route planner" })).toBeTruthy();

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Shared view" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Server" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Celebration events" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share map" })).toBeNull();

    const controls = screen.getByTestId("map-bottom-left-controls");
    expect(Array.from(controls.children).map((child) => child.className)).toEqual([
      "map-legend-control",
      "map-route-planner-control"
    ]);
  });

  it("does not persist settings changes in share mode", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      shareToken: "share-token",
      viewer: sharedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Route planner" }));
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "12" } });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not persist the last-visited map in share mode", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      shareToken: "share-token",
      viewer: sharedViewer
    }));

    expect(screen.getByAltText("Wurm Online map")).toBeTruthy();
    expect(window.localStorage.getItem("huginn:last-map")).toBeNull();
  });

  it("shows the share control for signed-in viewers outside share mode", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByRole("button", { name: "Share map" })).toBeTruthy();
  });

  it("shows the Share Map title and info tooltip inside the share panel", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Share map" }));

    expect(screen.getByRole("dialog", { name: "Share read-only link" }).textContent).toContain("Share Map");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("best used with those who do not have an account or map access");
    expect(tooltip.textContent).toContain("your settings are copied at the time of creation");
    expect(tooltip.textContent).toContain("will not be able to change any settings");
  });

  it("clamps the expiry input to whole hours between 1 and 24", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Share map" }));

    const input = screen.getByLabelText("Expires in hours");

    fireEvent.change(input, { target: { value: "48" } });
    expect(input).toHaveProperty("value", "24");

    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveProperty("value", "1");

    fireEvent.change(input, { target: { value: "2.7" } });
    expect(input).toHaveProperty("value", "3");

    fireEvent.change(input, { target: { value: "48" } });
    fireEvent.blur(input);
    expect(input).toHaveProperty("value", "24");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(input).toHaveProperty("value", "1");
  });

  it("posts an integer expiresInHours even after decimal input", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      expiresAt: "2026-09-04T22:00:00.000Z",
      url: "/share/abc123"
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Share map" }));
    fireEvent.change(screen.getByLabelText("Expires in hours"), { target: { value: "3.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
    const requestInit = calls[0]?.[1];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      expiresInHours: 4,
      layerId: "layer-terrain"
    });
  });

  it("generates a share link and copies the absolute URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      expiresAt: "2026-09-04T22:00:00.000Z",
      url: "/share/abc123"
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const writeText = mockClipboardWrite();

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Share map" }));

    const dialog = screen.getByRole("dialog", { name: "Share read-only link" });
    expect(dialog).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Expires in hours"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/share",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    ));

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
    const requestInit = calls[0]?.[1];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      expiresInHours: 4,
      layerId: "layer-terrain"
    });

    const absoluteUrl = `${window.location.origin}/share/abc123`;
    expect(await screen.findByLabelText("Share link URL")).toHaveProperty("value", absoluteUrl);
    expect(screen.getByText(/^Expires \d/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(absoluteUrl));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("shows the API error when share link creation fails", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: "Read access is required"
    }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Share map" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Read access is required");
    expect(screen.queryByLabelText("Share link URL")).toBeNull();
  });
});
