import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsSection } from "./alerts-section";

const openAlert = {
  id: "alert-1",
  rule: "FAILED_LOGINS_BY_IP",
  severity: "HIGH",
  status: "OPEN",
  title: "Repeated failed logins",
  description: "12 failed logins from a single IP",
  actorUsername: "Mako",
  mapName: "Celebration",
  createdAt: "2026-08-30T10:00:00.000Z"
};

const secondAlert = {
  id: "alert-2",
  rule: "NEW_ADMIN_IP",
  severity: "MEDIUM",
  status: "OPEN",
  title: "Admin action from new IP",
  description: "An admin signed in from an unseen IP",
  actorUsername: null,
  mapName: null,
  createdAt: "2026-08-29T09:00:00.000Z"
};

describe("AlertsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the 10 most recent open alerts and renders them read-only", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        json: async () => ({ alerts: [openAlert, secondAlert] }),
        ok: true
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(AlertsSection));

    expect(await screen.findByText("Repeated failed logins")).toBeTruthy();
    expect(screen.getByText("Admin action from new IP")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getByText("Rule: FAILED_LOGINS_BY_IP")).toBeTruthy();
    expect(screen.getByText("Celebration")).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(url.pathname).toBe("/api/admin/alerts");
    expect(url.searchParams.get("status")).toBe("OPEN");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("renders no filters and no action buttons, only the View all link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ alerts: [openAlert] }),
        ok: true
      }))
    );

    render(React.createElement(AlertsSection));
    expect(await screen.findByText("Repeated failed logins")).toBeTruthy();

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    const viewAll = screen.getByRole("link", { name: "View all →" });
    expect(viewAll.getAttribute("href")).toBe("/admin/alerts");
  });

  it("shows the empty state when there are no open alerts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ alerts: [] }),
        ok: true
      }))
    );

    render(React.createElement(AlertsSection));

    expect(await screen.findByText("No alerts.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  });
});
