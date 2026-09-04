import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkspace from "./map-workspace";

const UNIQUE_ALERT_DISMISSED_STORAGE_KEY = "huginn:unique-alert-dismissed";
const DAY_MS = 24 * 60 * 60 * 1000;

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
    }
  ],
  name: "Celebration",
  widthPx: 2048
} as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

describe("MapWorkspace unique-alive alert", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/map");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 2048
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2048
    });
  });

  it("is hidden when the last slain is recent (under 14 days)", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: daysAgo(5),
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the day count when the last slain is 14+ days old", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: daysAgo(23.5),
      map: activeMap,
      viewer: approvedViewer
    }));

    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("Potentially a unique alive — last slain 23 days ago");
    expect(screen.getByRole("button", { name: "Dismiss unique alert" })).toBeTruthy();
  });

  it("shows the no-kill message when the map has never recorded a slain", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: null,
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByRole("status").textContent).toContain(
      "Potentially a unique alive — no kill recorded"
    );
  });

  it("is hidden in share mode even when a unique may be alive", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: daysAgo(30),
      map: activeMap,
      shareToken: "share-token",
      viewer: sharedViewer
    }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismissal hides the alert and persists across remounts", () => {
    const slainAt = daysAgo(20);
    const { unmount } = render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: slainAt,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss unique alert" }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(UNIQUE_ALERT_DISMISSED_STORAGE_KEY) ?? "null"))
      .toEqual({ "map-1": slainAt });

    unmount();

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: slainAt,
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reappears when a newer slain ages out after a dismissal", () => {
    const firstSlainAt = daysAgo(20);
    const { rerender } = render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: firstSlainAt,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss unique alert" }));
    expect(screen.queryByRole("status")).toBeNull();

    rerender(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: daysAgo(15.5),
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByRole("status").textContent).toContain(
      "Potentially a unique alive — last slain 15 days ago"
    );
  });

  it("reappears for the never-slain message once a real slain has aged out", () => {
    const { rerender } = render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: null,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss unique alert" }));
    expect(screen.queryByRole("status")).toBeNull();

    rerender(React.createElement(MapWorkspace, {
      initialMarkers: [],
      lastUniqueSlainAt: daysAgo(16.5),
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByRole("status").textContent).toContain(
      "Potentially a unique alive — last slain 16 days ago"
    );
  });
});
