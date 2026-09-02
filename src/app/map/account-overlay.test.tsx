import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountOverlay, type AccountViewer } from "./account-overlay";

describe("AccountOverlay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a subdued login control when no user is authenticated", () => {
    renderAccountOverlay(null);

    const loginButton = screen.getByRole("button", { name: "Log in" });

    expect(loginButton.className).toContain("map-account-button");
    expect(screen.queryByRole("dialog", { name: "Account settings" })).toBeNull();
  });

  it("opens the login dialog from the logged-out control", () => {
    renderAccountOverlay(null);

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("dialog", { name: "Log in" })).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("opens account settings with privileges for an authenticated user", () => {
    renderAccountOverlay(
      {
        approvalStatus: "APPROVED",
        isAdmin: false,
        mapPermissions: [
          { accessLevel: "WRITE", isOperator: false, mapId: "map-celebration" },
          { accessLevel: "NONE", isOperator: false, mapId: "map-defiance" },
          { accessLevel: "READ", isOperator: false, mapId: "map-release" },
          { accessLevel: "NONE", isOperator: true, mapId: "map-xanadu" }
        ],
        pendingApprovalCount: 0,
        permissions: "WRITE",
        username: "Mako"
      },
      [
        { id: "map-celebration", name: "Celebration" },
        { id: "map-defiance", name: "Defiance" },
        { id: "map-release", name: "Release" },
        { id: "map-xanadu", name: "Xanadu" }
      ]
    );

    fireEvent.click(screen.getByRole("button", { name: "Mako" }));

    expect(screen.getByRole("dialog", { name: "Account settings" })).toBeTruthy();
    const permissionsGroup = screen.getByRole("group", { name: "Permissions" });
    expect(screen.queryByText("Status")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Permissions" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(permissionsGroup).getByText("Celebration")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Read/Write")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Release")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Read")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Xanadu")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Operator")).toBeTruthy();
    expect(within(permissionsGroup).queryByText("Defiance")).toBeNull();
    expect(within(permissionsGroup).queryByText("Admin")).toBeNull();
    expect(within(permissionsGroup).queryByText("Denied")).toBeNull();
    expect(screen.getByText("Project Huginn - v1.2.1")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Overlays" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Towers" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Deeds" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Notes" })).toBeNull();
    expect(screen.queryByText("Approve users")).toBeNull();
  });

  it("links admins to the administration page", () => {
    renderAccountOverlay(
      {
        approvalStatus: "APPROVED",
        isAdmin: true,
        pendingApprovalCount: 3,
        permissions: "WRITE",
        username: "Admin"
      },
      [
        { id: "map-celebration", name: "Celebration" },
        { id: "map-defiance", name: "Defiance" }
      ]
    );

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    const permissionsGroup = screen.getByRole("group", { name: "Permissions" });

    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));

    expect(within(permissionsGroup).getByText("Global")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Admin")).toBeTruthy();
    expect(within(permissionsGroup).queryByText("Celebration")).toBeNull();
    expect(within(permissionsGroup).queryByText("Defiance")).toBeNull();
    expect(screen.getByRole("link", { name: "Administration 3 pending" }).getAttribute("href")).toBe(
      "/admin"
    );
    expect(screen.queryByRole("link", { name: "Accounts 3 pending" })).toBeNull();
    expect(screen.queryByRole("link", { name: "History log" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Deleted markers" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reveal watermark" })).toBeNull();
    expect(screen.queryByText("Manage accounts")).toBeNull();
    expect(screen.queryByLabelText("Access for Mako")).toBeNull();
  });

  it("lets authenticated users change their own password from the account dropdown", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    renderAccountOverlay({
      approvalStatus: "APPROVED",
      isAdmin: false,
      pendingApprovalCount: 0,
      permissions: "WRITE",
      username: "Mako"
    });

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

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", {
        body: JSON.stringify({
          confirmPassword: "new secure password",
          currentPassword: "correct horse battery staple",
          newPassword: "new secure password"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      })
    );
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect(screen.getByLabelText("Current password")).toHaveProperty("value", "");
    expect(screen.getByLabelText("New password")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Confirm new password")).toHaveProperty("value", "");
  });
});

function renderAccountOverlay(
  viewer: AccountViewer | null,
  servers: Array<{ id: string; name: string }> = []
) {
  function ControlledAccountOverlay() {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
      <AccountOverlay
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        servers={servers}
        viewer={viewer}
      />
    );
  }

  return render(React.createElement(ControlledAccountOverlay));
}
