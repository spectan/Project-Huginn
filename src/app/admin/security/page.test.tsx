import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    user: { findMany: mocks.userFindMany }
  }
}));

import AdminSecurityPage from "./page";

describe("AdminSecurityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { isAdmin: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ alerts: [] }),
        ok: true
      }))
    );
  });

  it("renders the security page with the alerts history, watermark, and canary sections", async () => {
    render(await AdminSecurityPage());

    expect(screen.getByRole("heading", { level: 1, name: "Security" })).toBeTruthy();
    expect(screen.getByLabelText(/Status/)).toBeTruthy();
    expect(screen.getByLabelText(/Severity/)).toBeTruthy();
    expect(await screen.findByText("No alerts.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Watermark" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Canaries" })).toBeTruthy();
  });

  it("passes the loaded users to the watermark UserID lookup", async () => {
    render(await AdminSecurityPage());

    expect(mocks.userFindMany).toHaveBeenCalledWith({
      orderBy: { watermarkNumber: "asc" },
      select: { id: true, username: true, watermarkNumber: true }
    });

    const digitsInput = screen.getByLabelText("UserID");
    fireEvent.change(digitsInput, { target: { value: "0007" } });
    expect(screen.getByText("Mako")).toBeTruthy();

    fireEvent.change(digitsInput, { target: { value: "9999" } });
    expect(screen.getByText("No match")).toBeTruthy();
  });

  it("renders access denied for anonymous viewers", async () => {
    mocks.viewer = null;

    render(await AdminSecurityPage());

    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(screen.getByText("Admin access is required")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Watermark" })).toBeNull();
  });

  it("renders access denied for non-admin viewers", async () => {
    mocks.viewer = { isAdmin: false };

    render(await AdminSecurityPage());

    expect(screen.getByText("Admin access is required")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Watermark" })).toBeNull();
  });
});
