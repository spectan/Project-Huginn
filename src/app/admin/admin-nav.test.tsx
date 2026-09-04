import { render, screen } from "@testing-library/react";
import React from "react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminNav, AdminTopbarTitle } from "./admin-nav";

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
