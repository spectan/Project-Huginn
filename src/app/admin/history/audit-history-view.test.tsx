import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditHistoryView } from "./audit-history-view";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() }))
}));

const defaultFilters = {
  actionGroup: "" as const,
  actorUserId: "",
  mapId: "",
  order: "desc" as const
};

const defaultProps = {
  filters: defaultFilters,
  maps: [
    { id: "map-wurm", name: "Wurm" },
    { id: "map-xanadu", name: "Xanadu" }
  ],
  users: [
    { id: "user-1", username: "Admin" },
    { id: "user-2", username: "Mako" }
  ]
};

describe("AuditHistoryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a concise admin history table with coordinates and map links", () => {
    render(
      React.createElement(AuditHistoryView, {
        ...defaultProps,
        events: [
          {
            action: "MARKER_CREATED",
            actorUsername: "Mako",
            createdAt: "2026-05-10T04:00:00.000Z",
            id: "event-1",
            mapId: "map-wurm",
            mapName: "Wurm",
            metadata: { markerType: "tower" },
            targetId: "tower-1",
            targetType: "TOWER",
            x: 100,
            y: 200
          },
          {
            action: "USER_APPROVED",
            actorUsername: "Admin",
            createdAt: "2026-05-10T03:00:00.000Z",
            id: "event-2",
            mapId: null,
            mapName: "",
            metadata: {},
            targetId: "user-1",
            targetType: "USER",
            x: null,
            y: null
          }
        ],
        nextCursor: "cursor-value"
      })
    );

    expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
    expect(screen.getAllByText("Mako")).toHaveLength(2); // actor cell + user filter option
    expect(screen.getByText("Marker created")).toBeTruthy();
    expect(screen.getAllByText("Admin")).toHaveLength(2); // actor cell + user filter option
    expect(screen.getByText("User approved")).toBeTruthy();
    expect(screen.getByText('{"markerType":"tower"}')).toBeTruthy();

    const towerLink = screen.getByRole("link", { name: /Tower/ });
    expect(towerLink.getAttribute("href")).toBe("/map?server=wurm&x=100&y=200");

    expect(screen.getByRole("link", { name: "Older" }).getAttribute("href")).toBe(
      "/admin/history?before=cursor-value"
    );
  });

  it("renders the filter bar with defaults", () => {
    render(React.createElement(AuditHistoryView, {
      ...defaultProps,
      events: [],
      nextCursor: null
    }));

    expect((screen.getByLabelText("Filter by user") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Filter by action") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Filter by map") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Sort by date") as HTMLSelectElement).value).toBe("desc");
    expect(screen.getByRole("option", { name: "All users" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "All actions" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "All maps" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Newest first" })).toBeTruthy();
  });

  it("keeps metadata collapsed in a details element with a truncated hint", () => {
    const metadata = {
      markerType: "tower",
      note: "a fairly long metadata payload that exceeds the hint length",
      quality: 90
    };
    const formatted = JSON.stringify(metadata);
    render(
      React.createElement(AuditHistoryView, {
        ...defaultProps,
        events: [
          {
            action: "MARKER_UPDATED",
            actorUsername: "Mako",
            createdAt: "2026-05-10T04:00:00.000Z",
            id: "event-1",
            mapId: "map-wurm",
            mapName: "Wurm",
            metadata,
            targetId: "tower-1",
            targetType: "TOWER",
            x: 100,
            y: 200
          }
        ],
        nextCursor: null
      })
    );

    const summary = screen.getByText(`${formatted.slice(0, 40)}…`);
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(screen.getByText(formatted)).toBeTruthy();
  });

  it("preserves the active filters in the pagination link", () => {
    render(
      React.createElement(AuditHistoryView, {
        ...defaultProps,
        events: [],
        filters: {
          actionGroup: "delete",
          actorUserId: "user-2",
          mapId: "map-wurm",
          order: "desc"
        },
        nextCursor: "cursor-value"
      })
    );

    const href = screen.getByRole("link", { name: "Older" }).getAttribute("href");
    expect(href).toBe(
      "/admin/history?user=user-2&action=delete&map=map-wurm&before=cursor-value"
    );
  });

  it("labels the pagination link Newer when sorting oldest first", () => {
    render(
      React.createElement(AuditHistoryView, {
        ...defaultProps,
        events: [],
        filters: { ...defaultFilters, order: "asc" },
        nextCursor: "cursor-value"
      })
    );

    const href = screen.getByRole("link", { name: "Newer" }).getAttribute("href");
    expect(href).toBe("/admin/history?sort=asc&before=cursor-value");
  });

  it("renders an empty state when no audit events exist", () => {
    render(React.createElement(AuditHistoryView, {
      ...defaultProps,
      events: [],
      nextCursor: null
    }));

    expect(screen.getByText("No history events yet")).toBeTruthy();
  });
});
