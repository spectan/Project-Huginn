import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminAccessDenied } from "../admin-access-denied";
import { AdminAccountsView } from "./accounts-view";

const maps = [
  { id: "map-celebration", name: "Celebration" },
  { id: "map-defiance", name: "Defiance" }
];

const makoUser = {
  accessLevel: "NONE" as const,
  approvedByUsername: "Admin",
  approvalStatus: "PENDING" as const,
  createdAt: "2026-05-10T00:00:00.000Z",
  id: "user-1",
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ" as const, isOperator: false, mapId: "map-celebration" }
  ],
  username: "Mako"
};

type ViewProps = React.ComponentProps<typeof AdminAccountsView>;

function renderView(props: Partial<ViewProps> = {}) {
  render(
    React.createElement(AdminAccountsView, { maps, users: [makoUser], viewerCanManageGlobalAccounts: true, ...props })
  );
}

function stubFetchJson(body: unknown) {
  const fetchMock = vi.fn(async () => ({ json: async () => body, ok: true })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function approvedUserResponse(overrides: Partial<ViewProps["users"][number]>) {
  return { user: { ...makoUser, approvalStatus: "APPROVED", ...overrides } };
}

async function expectJsonPatch(fetchMock: typeof fetch, url: string, body: unknown) {
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    })
  );
}

function showPermissions() {
  fireEvent.click(screen.getByRole("button", { name: "Show server permissions for Mako" }));
}

describe("AdminAccountsView", () => {
  it("renders account management in the dark admin layout", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Created 2026-05-10 00:00:00 UTC")).toBeTruthy();
    expect(screen.getByText("Approved by - Admin")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show server permissions for Mako" })).toBeTruthy();
    expect(screen.queryByLabelText("Set all server access for Mako")).toBeNull();
    expect(screen.queryByLabelText("Access for Mako on Celebration")).toBeNull();
    showPermissions();
    expect(screen.getByRole("group", { name: "Server permissions for Mako" })).toBeTruthy();
    expect(screen.getByLabelText("Set all server access for Mako")).toBeTruthy();
    expect(screen.getByText("Celebration")).toBeTruthy();
    expect(screen.getByText("Defiance")).toBeTruthy();
    expect(screen.getAllByText("Operator")).toHaveLength(2);
    expect(screen.getByLabelText("Access for Mako on Celebration")).toHaveProperty("value", "READ");
    expect(screen.getByLabelText("Access for Mako on Defiance")).toHaveProperty("value", "NONE");
    expect(screen.getByRole("checkbox", { name: "Operator for Mako on Celebration" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Admin for Mako" })).toBeTruthy();
    expect(screen.getAllByText("Admin")).toHaveLength(1);
    expect(screen.queryByText("Global admin")).toBeNull();
    expect(screen.getByRole("button", { name: "Save Mako" })).toBeTruthy();
    expect(screen.getByLabelText("New password for Mako")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password Mako" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Mako" })).toBeTruthy();
  });

  it("filters account cards by username from the search field", () => {
    renderView({
      users: [
        makoUser,
        { ...makoUser, approvedByUsername: "Root", createdAt: "2026-05-11T00:00:00.000Z", id: "user-2", username: "Stargrace" }
      ]
    });

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "star" } });

    expect(screen.queryByText("Mako")).toBeNull();
    expect(screen.getByText("Stargrace")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "missing" } });

    expect(screen.queryByText("Stargrace")).toBeNull();
    expect(screen.getByText("No accounts match your search")).toBeTruthy();
  });

  it("saves privilege changes through the admin users API", async () => {
    const fetchMock = stubFetchJson(
      approvedUserResponse({
        isAdmin: true,
        mapPermissions: [{ accessLevel: "WRITE", isOperator: true, mapId: "map-defiance" }]
      })
    );

    renderView();

    showPermissions();
    fireEvent.change(screen.getByLabelText("Access for Mako on Defiance"), { target: { value: "WRITE" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Operator for Mako on Defiance" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Admin for Mako" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Mako" }));

    await expectJsonPatch(fetchMock, "/api/admin/users/user-1", {
      isAdmin: true,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-celebration" },
        { accessLevel: "WRITE", isOperator: true, mapId: "map-defiance" }
      ]
    });
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("sets all server access values for a user", () => {
    renderView();

    showPermissions();
    fireEvent.change(screen.getByLabelText("Set all server access for Mako"), { target: { value: "WRITE" } });

    expect(screen.getByLabelText("Access for Mako on Celebration")).toHaveProperty("value", "WRITE");
    expect(screen.getByLabelText("Access for Mako on Defiance")).toHaveProperty("value", "WRITE");
  });

  it("locks operator controls on for global admins", async () => {
    const fetchMock = stubFetchJson(approvedUserResponse({ isAdmin: true, mapPermissions: [] }));

    renderView({ users: [{ ...makoUser, isAdmin: true }] });

    showPermissions();

    expect(screen.getByRole("checkbox", { name: "Operator for Mako on Celebration" })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Operator for Mako on Celebration" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("checkbox", { name: "Operator for Mako on Defiance" })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Operator for Mako on Defiance" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Save Mako" }));

    await expectJsonPatch(fetchMock, "/api/admin/users/user-1", {
      isAdmin: true,
      mapPermissions: [
        { accessLevel: "READ", isOperator: false, mapId: "map-celebration" },
        { accessLevel: "NONE", isOperator: false, mapId: "map-defiance" }
      ]
    });
  });

  it("hides global account controls for scoped operators", () => {
    renderView({ maps: [{ id: "map-defiance", name: "Defiance" }], viewerCanManageGlobalAccounts: false });

    showPermissions();
    expect(screen.getByLabelText("Access for Mako on Defiance")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Admin for Mako" })).toBeNull();
    expect(screen.queryByLabelText("New password for Mako")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Mako" })).toBeNull();
  });

  it("changes a user password through the admin password API", async () => {
    const fetchMock = stubFetchJson(approvedUserResponse({ isAdmin: false, mapPermissions: [] }));

    renderView({ users: [{ ...makoUser, approvalStatus: "APPROVED" }] });

    showPermissions();
    fireEvent.change(screen.getByLabelText("New password for Mako"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password Mako" }));

    await expectJsonPatch(fetchMock, "/api/admin/users/user-1/password", { password: "new-secure-password" });
    showPermissions();
    expect(screen.getByLabelText("New password for Mako")).toHaveProperty("value", "");
  });

  it("removes deleted users from account management", async () => {
    const fetchMock = stubFetchJson({ userId: "user-1" });

    renderView({ users: [{ ...makoUser, approvalStatus: "APPROVED" }] });

    fireEvent.click(screen.getByRole("button", { name: "Remove Mako" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      { method: "DELETE" }
    ));
    expect(screen.queryByText("Mako")).toBeNull();
    expect(screen.getByText("No accounts yet")).toBeTruthy();
  });

  it("renders access denied in the admin layout", () => {
    render(React.createElement(AdminAccessDenied, { title: "Accounts", message: "Admin access is required" }));

    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("Admin access is required")).toBeTruthy();
  });
});
