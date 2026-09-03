import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAlertsView } from "./alerts-view";

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

const acknowledgedAlert = {
  id: "alert-2",
  rule: "BULK_MAP_DATA_ACCESS",
  severity: "LOW",
  status: "ACKNOWLEDGED",
  title: "Bulk map data pull",
  description: "Large /api/maps/active response",
  actorUsername: null,
  mapName: null,
  createdAt: "2026-08-29T09:00:00.000Z"
};

function stubFetchWith(alerts: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return { json: async () => ({ ok: true }), ok: true };
    }
    void input;
    return { json: async () => ({ alerts }), ok: true };
  }) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastFetchedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  const call = fetchMock.mock.calls.at(-1);
  return new URL(String(call?.[0]), "http://localhost");
}

describe("AdminAlertsView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders alert rows from the API with an Open default filter", async () => {
    const fetchMock = stubFetchWith([openAlert, acknowledgedAlert]);

    render(React.createElement(AdminAlertsView));

    expect(await screen.findByText("Repeated failed logins")).toBeTruthy();
    expect(screen.getByText("Bulk map data pull")).toBeTruthy();
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("low")).toBeTruthy();
    expect(screen.getByText("Rule: FAILED_LOGINS_BY_IP")).toBeTruthy();
    expect(screen.getByText("Status: acknowledged")).toBeTruthy();
    expect(screen.getByText("Celebration")).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(2);

    const url = lastFetchedUrl(fetchMock);
    expect(url.pathname).toBe("/api/admin/alerts");
    expect(url.searchParams.get("status")).toBe("OPEN");
    expect(url.searchParams.get("limit")).toBe("500");
  });

  it("sends both filter params to the API when the filters change", async () => {
    const fetchMock = stubFetchWith([openAlert]);

    render(React.createElement(AdminAlertsView));
    expect(await screen.findByText("Repeated failed logins")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Severity/), { target: { value: "HIGH" } });

    await waitFor(() => {
      const url = lastFetchedUrl(fetchMock);
      expect(url.searchParams.get("status")).toBe("OPEN");
      expect(url.searchParams.get("severity")).toBe("HIGH");
      expect(url.searchParams.get("limit")).toBe("500");
    });

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "ALL" } });

    await waitFor(() => {
      const url = lastFetchedUrl(fetchMock);
      expect(url.searchParams.get("status")).toBeNull();
      expect(url.searchParams.get("severity")).toBe("HIGH");
    });
  });

  it("deletes an alert through the API and removes the row", async () => {
    const fetchMock = stubFetchWith([openAlert, acknowledgedAlert]);

    render(React.createElement(AdminAlertsView));
    expect(await screen.findByText("Repeated failed logins")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete Repeated failed logins" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/alerts/alert-1", { method: "DELETE" })
    );
    await waitFor(() => expect(screen.queryByText("Repeated failed logins")).toBeNull());
    expect(screen.getByText("Bulk map data pull")).toBeTruthy();
  });

  it("renders an empty state when there are no alerts", async () => {
    stubFetchWith([]);

    render(React.createElement(AdminAlertsView));

    expect(await screen.findByText("No alerts.")).toBeTruthy();
  });
});
