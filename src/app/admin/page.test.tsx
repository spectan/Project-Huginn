import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertCount: vi.fn(async () => 2),
  campCount: vi.fn(async () => 0),
  deedCount: vi.fn(async () => 1),
  locateSoulCount: vi.fn(async () => 0),
  minedoorCount: vi.fn(async () => 0),
  noteCount: vi.fn(async () => 2),
  pathMarkerCount: vi.fn(async () => 0),
  riftCount: vi.fn(async () => 0),
  towerCount: vi.fn(async () => 1),
  userCount: vi.fn(async (args?: { where?: unknown }) => (args === undefined ? 9 : 3)),
  userFindMany: vi.fn(async () => [
    { id: "user-1", username: "Mako", watermarkNumber: 7 },
    { id: "user-2", username: "Stargrace", watermarkNumber: 123 },
    { id: "user-3", username: null, watermarkNumber: null }
  ]),
  viewer: null as null | { isAdmin: boolean }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.viewer)
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    alert: { count: mocks.alertCount },
    camp: { count: mocks.campCount },
    deed: { count: mocks.deedCount },
    locateSoul: { count: mocks.locateSoulCount },
    minedoor: { count: mocks.minedoorCount },
    note: { count: mocks.noteCount },
    pathMarker: { count: mocks.pathMarkerCount },
    rift: { count: mocks.riftCount },
    tower: { count: mocks.towerCount },
    user: { count: mocks.userCount, findMany: mocks.userFindMany }
  }
}));

import AdminDashboardPage from "./page";

describe("AdminDashboardPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { isAdmin: true };
    fetchMock = vi.fn(async () => ({
      json: async () => ({ alerts: [] }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders stat tiles with the admin overview counts", async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();

    const pendingTile = screen.getByText("Pending accounts").closest(".admin-stat");
    const alertsTile = screen.getByText("Unresolved alerts").closest(".admin-stat");
    const expiringTile = screen.getByText("Deleted markers expiring (24h)").closest(".admin-stat");
    const usersTile = screen.getByText("Total users").closest(".admin-stat");

    expect(pendingTile?.querySelector("strong")?.textContent).toBe("3");
    expect(alertsTile?.querySelector("strong")?.textContent).toBe("2");
    expect(expiringTile?.querySelector("strong")?.textContent).toBe("4");
    expect(usersTile?.querySelector("strong")?.textContent).toBe("9");
    expect(screen.queryByText("Markers expiring within 24h")).toBeNull();
  });

  it("renders no quick links beyond the alerts View all link — navigation lives in the sidebar", async () => {
    render(await AdminDashboardPage());

    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/admin/alerts");
  });

  it("renders the read-only alerts section", async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Alerts" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all →" }).getAttribute("href")).toBe("/admin/alerts");
    expect(screen.queryByRole("button", { name: "Run detection now" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(await screen.findByText("No alerts.")).toBeTruthy();

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(url.pathname).toBe("/api/admin/alerts");
    expect(url.searchParams.get("status")).toBe("OPEN");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("renders the watermark section with a compact UserID lookup", async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Watermark" })).toBeTruthy();
    expect(screen.getByText(/Paste or drop a screenshot/)).toBeTruthy();

    const digitsInput = screen.getByLabelText("UserID");
    fireEvent.change(digitsInput, { target: { value: "0007" } });
    expect(screen.getByText("Mako")).toBeTruthy();

    fireEvent.change(digitsInput, { target: { value: "9999" } });
    expect(screen.getByText("No match")).toBeTruthy();
  });

  it("renders the canary section", async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Canaries" })).toBeTruthy();
    expect(screen.getByLabelText(/Paste a leaked marker dump/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Identify" })).toBeTruthy();
  });

  it("renders access denied for anonymous viewers", async () => {
    mocks.viewer = null;

    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Admin access is required")).toBeTruthy();
    expect(screen.queryByText("Pending accounts")).toBeNull();
  });

  it("renders access denied for non-admin viewers", async () => {
    mocks.viewer = { isAdmin: false };

    render(await AdminDashboardPage());

    expect(screen.getByText("Admin access is required")).toBeTruthy();
    expect(screen.queryByText("Pending accounts")).toBeNull();
  });
});
