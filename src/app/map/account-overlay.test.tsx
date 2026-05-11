import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountOverlay } from "./account-overlay";

describe("AccountOverlay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a subdued login control when no user is authenticated", () => {
    render(React.createElement(AccountOverlay, { viewer: null }));

    const loginButton = screen.getByRole("button", { name: "Log in" });

    expect(loginButton.className).toContain("map-account-button");
    expect(screen.queryByRole("dialog", { name: "Account settings" })).toBeNull();
  });

  it("opens the login dialog from the logged-out control", () => {
    render(React.createElement(AccountOverlay, { viewer: null }));

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("dialog", { name: "Log in" })).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("opens account settings with privileges for an authenticated user", () => {
    render(
      React.createElement(AccountOverlay, {
        viewer: {
          approvalStatus: "APPROVED",
          isAdmin: false,
          pendingApprovalCount: 0,
          permissions: "WRITE",
          username: "Mako"
        }
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Mako" }));

    expect(screen.getByRole("dialog", { name: "Account settings" })).toBeTruthy();
    expect(screen.getByText("Read access")).toBeTruthy();
    expect(screen.getByText("Write access")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Overlays" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Towers" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Deeds" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Notes" })).toBeNull();
    expect(screen.queryByText("Approve users")).toBeNull();
  });

  it("links admins to the dedicated account management pages", () => {
    render(
      React.createElement(AccountOverlay, {
        viewer: {
          approvalStatus: "APPROVED",
          isAdmin: true,
          pendingApprovalCount: 3,
          permissions: "WRITE",
          username: "Admin"
        }
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    expect(screen.getByRole("link", { name: "Accounts 3 pending" }).getAttribute("href")).toBe(
      "/admin/accounts"
    );
    expect(screen.getByRole("link", { name: "History log" }).getAttribute("href")).toBe(
      "/admin/history"
    );
    expect(screen.getByRole("link", { name: "Deleted markers" }).getAttribute("href")).toBe(
      "/admin/deleted-markers"
    );
    expect(screen.queryByText("Manage accounts")).toBeNull();
    expect(screen.queryByLabelText("Access for Mako")).toBeNull();
  });

  it("lets authenticated users change their own password from the account dropdown", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(AccountOverlay, {
        viewer: {
          approvalStatus: "APPROVED",
          isAdmin: false,
          pendingApprovalCount: 0,
          permissions: "WRITE",
          username: "Mako"
        }
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Mako" }));
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "correct horse battery staple" }
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new secure password" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new secure password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      {
        body: JSON.stringify({
          confirmPassword: "new secure password",
          currentPassword: "correct horse battery staple",
          newPassword: "new secure password"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    ));
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect(screen.getByLabelText("Current password")).toHaveProperty("value", "");
    expect(screen.getByLabelText("New password")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Confirm new password")).toHaveProperty("value", "");
  });
});
