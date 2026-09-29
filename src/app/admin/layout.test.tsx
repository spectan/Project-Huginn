import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

const mocks = vi.hoisted(() => ({
  viewer: null as null | { approvalStatus: "APPROVED"; isAdmin: boolean }
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => mocks.viewer)
}));

vi.mock("./admin-nav", () => ({
  AdminBackToMapLink: () => <a href="/map">← Back to map</a>,
  AdminNav: ({ accountsOnly }: { accountsOnly?: boolean }) => (
    <nav>{accountsOnly === true ? "accounts-only nav" : "full nav"}</nav>
  ),
  AdminTopbarTitle: () => <span>Admin / Dashboard</span>
}));

describe("AdminLayout", () => {
  it("shows the full navigation to approved global admins", async () => {
    mocks.viewer = { approvalStatus: "APPROVED", isAdmin: true };

    render(await AdminLayout({ children: <p>content</p> }));

    expect(screen.getByText("full nav")).toBeTruthy();
  });

  it("limits the navigation to accounts for operators", async () => {
    mocks.viewer = { approvalStatus: "APPROVED", isAdmin: false };

    render(await AdminLayout({ children: <p>content</p> }));

    expect(screen.getByText("accounts-only nav")).toBeTruthy();
  });

  it("renders the shell with a back-to-map button in the topbar", async () => {
    render(await AdminLayout({ children: <p>content</p> }));

    const backLink = screen.getByRole("link", { name: "← Back to map" });
    expect(backLink.getAttribute("href")).toBe("/map");
    expect(screen.getByText("content")).toBeTruthy();
  });
});
