import { render, screen, waitFor } from "@testing-library/react";
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
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  viewer: null as null | {
    approvalStatus: "APPROVED" | "PENDING";
    isAdmin: boolean;
    mapPermissions?: { accessLevel: "READ"; isOperator: boolean; mapId: string }[];
  }
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
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
    user: { count: mocks.userCount }
  }
}));

import AdminDashboardPage from "./page";

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { approvalStatus: "APPROVED", isAdmin: true };
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ alerts: [] }), ok: true })));
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
    expect(links[0]?.getAttribute("href")).toBe("/admin/security");
  });

  it("renders the alerts section (covered in detail by alerts-section.test.tsx)", async () => {
    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Alerts" })).toBeTruthy();
    expect(await screen.findByText("No alerts.")).toBeTruthy();
  });

  it("does not render the watermark or canary sections — they live on the security page", async () => {
    render(await AdminDashboardPage());

    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());

    expect(screen.queryByRole("heading", { name: "Watermark" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Canaries" })).toBeNull();
  });

  it.each([
    ["anonymous viewers", null],
    ["unapproved admins", { approvalStatus: "PENDING", isAdmin: true }],
    ["non-admin viewers", { approvalStatus: "APPROVED", isAdmin: false }]
  ] as const)("renders access denied for %s", async (_label, viewer) => {
    mocks.viewer = viewer;

    render(await AdminDashboardPage());

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Admin access is required")).toBeTruthy();
    expect(screen.queryByText("Pending accounts")).toBeNull();
  });

  it("redirects operators who can manage accounts to the accounts page", async () => {
    mocks.viewer = {
      approvalStatus: "APPROVED",
      isAdmin: false,
      mapPermissions: [{ accessLevel: "READ", isOperator: true, mapId: "map-1" }]
    };

    await expect(AdminDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/admin/accounts");
    expect(mocks.userCount).not.toHaveBeenCalled();
  });
});
