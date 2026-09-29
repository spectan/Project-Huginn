import { act, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkspace from "./map-workspace";
import { activeMap, approvedViewer, renderWorkspace, sharedViewer } from "./test-helpers";

const UNIQUE_ALERT_DISMISSED_STORAGE_KEY = "huginn:unique-alert-dismissed";
const DAY_MS = 24 * 60 * 60 * 1000;

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
    renderWorkspace({ lastUniqueSlainAt: daysAgo(5) })

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the day count when the last slain is 14+ days old", () => {
    renderWorkspace({ lastUniqueSlainAt: daysAgo(23.5) })

    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("Potentially a unique alive — last slain 23 days ago");
    expect(screen.getByRole("button", { name: "Dismiss unique alert" })).toBeTruthy();
  });

  it("shows the no-kill message when the map has never recorded a slain", () => {
    renderWorkspace({ lastUniqueSlainAt: null })

    expect(screen.getByRole("status").textContent).toContain(
      "Potentially a unique alive — no kill recorded"
    );
  });

  it("is hidden in share mode even when a unique may be alive", () => {
    renderWorkspace({ lastUniqueSlainAt: daysAgo(30), shareToken: "share-token", viewer: sharedViewer })

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismissal hides the alert and persists across remounts", () => {
    const slainAt = daysAgo(20);
    const { unmount } = renderWorkspace({ lastUniqueSlainAt: slainAt })

    fireEvent.click(screen.getByRole("button", { name: "Dismiss unique alert" }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(UNIQUE_ALERT_DISMISSED_STORAGE_KEY) ?? "null"))
      .toEqual({ "map-1": slainAt });

    unmount();

    renderWorkspace({ lastUniqueSlainAt: slainAt })

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reappears when a newer slain ages out after a dismissal", () => {
    const firstSlainAt = daysAgo(20);
    const { rerender } = renderWorkspace({ lastUniqueSlainAt: firstSlainAt })

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

  it("appears in a long-lived tab once the respawn window passes", () => {
    vi.useFakeTimers({ now: Date.now() });

    try {
      renderWorkspace({ lastUniqueSlainAt: new Date(Date.now() - 14 * DAY_MS + 30 * 1000).toISOString() })

      expect(screen.queryByRole("status")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(60 * 1000);
      });

      expect(screen.getByRole("status").textContent).toContain(
        "Potentially a unique alive — last slain 14 days ago"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("reappears for the never-slain message once a real slain has aged out", () => {
    const { rerender } = renderWorkspace({ lastUniqueSlainAt: null })

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
