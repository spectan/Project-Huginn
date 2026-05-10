import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { AuditHistoryView } from "./audit-history-view";

describe("AuditHistoryView", () => {
  it("renders a concise admin history table", () => {
    render(
      React.createElement(AuditHistoryView, {
        events: [
          {
            action: "MARKER_CREATED",
            actorUsername: "Mako",
            createdAt: "2026-05-10T04:00:00.000Z",
            id: "event-1",
            mapName: "Wurm",
            metadata: { markerType: "tower" },
            targetId: "tower-1",
            targetType: "TOWER"
          }
        ],
        nextCursor: "cursor-value"
      })
    );

    expect(screen.getByRole("main").className).toContain("history-page--dark");
    expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.getByText("Marker created")).toBeTruthy();
    expect(screen.getByText("Tower")).toBeTruthy();
    expect(screen.getByText("Wurm")).toBeTruthy();
    expect(screen.getByText('{"markerType":"tower"}')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Older" }).getAttribute("href")).toBe(
      "/admin/history?before=cursor-value"
    );
  });

  it("renders an empty state when no audit events exist", () => {
    render(React.createElement(AuditHistoryView, { events: [], nextCursor: null }));

    expect(screen.getByText("No history events yet")).toBeTruthy();
  });
});
