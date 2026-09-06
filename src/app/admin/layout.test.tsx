import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

vi.mock("./admin-nav", () => ({
  AdminBackToMapLink: () => <a href="/map">← Back to map</a>,
  AdminNav: () => <nav>nav</nav>,
  AdminTopbarTitle: () => <span>Admin / Dashboard</span>
}));

describe("AdminLayout", () => {
  it("renders the shell with a back-to-map button in the topbar", () => {
    render(React.createElement(AdminLayout, null, <p>content</p>));

    const backLink = screen.getByRole("link", { name: "← Back to map" });
    expect(backLink.getAttribute("href")).toBe("/map");
    expect(screen.getByText("content")).toBeTruthy();
  });
});
