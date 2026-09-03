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

  it("renders all admin sections", () => {
    render(React.createElement(AdminNav));

    expect(screen.getByText("Huginn Admin")).toBeTruthy();
    for (const label of ["Dashboard", "Accounts", "History Log", "Deleted Markers"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("link", { name: "Alerts" })).toBeNull();
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
