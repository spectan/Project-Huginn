import { render, screen } from "@testing-library/react";
import React from "react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBackToMapLink, AdminNav, AdminTopbarTitle } from "./admin-nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

const usePathnameMock = vi.mocked(usePathname);

describe("AdminNav", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/admin");
  });

  it("renders all admin sections in alphabetical order", () => {
    render(React.createElement(AdminNav));

    const brandLink = screen.getByRole("link", { name: "Huginn" });
    expect(brandLink.getAttribute("href")).toBe("/admin");
    const links = screen.getAllByRole("link").filter((link) => link !== brandLink);
    expect(links.map((link) => link.textContent)).toEqual([
      "Accounts",
      "Dashboard",
      "Deleted Markers",
      "Discord",
      "History Log",
      "Security"
    ]);
    expect(screen.queryByRole("link", { name: "Watermark" })).toBeNull();
  });

  it("marks the dashboard active on the admin root", () => {
    render(React.createElement(AdminNav));

    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the matching section active for nested admin paths", () => {
    usePathnameMock.mockReturnValue("/admin/deleted-markers");

    render(React.createElement(AdminNav));

    expect(screen.getByRole("link", { name: "Deleted Markers" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("AdminTopbarTitle", () => {
  it("shows the section derived from the current path", () => {
    usePathnameMock.mockReturnValue("/admin/history");

    render(React.createElement(AdminTopbarTitle));

    expect(screen.getByText("History Log")).toBeTruthy();
  });
});

describe("AdminBackToMapLink", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("links to the plain map route when no map was visited", () => {
    render(React.createElement(AdminBackToMapLink));

    const backLink = screen.getByRole("link", { name: "← Back to map" });
    expect(backLink.getAttribute("href")).toBe("/map");
    expect(backLink.className).toContain("admin-topbar-back");
  });

  it("links to the last-visited map stored in localStorage", () => {
    window.localStorage.setItem("huginn:last-map", "map-3");

    render(React.createElement(AdminBackToMapLink));

    expect(screen.getByRole("link", { name: "← Back to map" }).getAttribute("href")).toBe("/map?server=3");
  });

  it("keeps map ids without a map- prefix as-is", () => {
    window.localStorage.setItem("huginn:last-map", "celebration");

    render(React.createElement(AdminBackToMapLink));

    expect(screen.getByRole("link", { name: "← Back to map" }).getAttribute("href")).toBe("/map?server=celebration");
  });
});
