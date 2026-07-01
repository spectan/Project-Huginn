import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { AuditHistoryView } from "./audit-history-view";

describe("AuditHistoryView", () => {
  it("renders a concise admin history table with coordinates and map links", () => {
    render(
      React.createElement(AuditHistoryView, {
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

    expect(screen.getByRole("main").className).toContain("history-page--dark");
    expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
    expect(screen.getAllByText("Mako")).toHaveLength(1);
    expect(screen.getByText("Marker created")).toBeTruthy();
    expect(screen.getAllByText("Admin")).toHaveLength(2); // header + actor cell
    expect(screen.getByText("User approved")).toBeTruthy();
    expect(screen.getByText("Wurm")).toBeTruthy();
    expect(screen.getByText('{"markerType":"tower"}')).toBeTruthy();

    const towerLink = screen.getByRole("link", { name: /Tower/ });
    expect(towerLink.getAttribute("href")).toBe("/map?server=wurm&x=100&y=200");

    expect(screen.getByRole("link", { name: "Older" }).getAttribute("href")).toBe(
      "/admin/history?before=cursor-value"
    );
  });

  it("renders an empty state when no audit events exist", () => {
    render(React.createElement(AuditHistoryView, { events: [], nextCursor: null }));

    expect(screen.getByText("No history events yet")).toBeTruthy();
  });
});
