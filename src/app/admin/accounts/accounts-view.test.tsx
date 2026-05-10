import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminAccountsAccessDenied, AdminAccountsView } from "./accounts-view";

describe("AdminAccountsView", () => {
  it("renders account management in the dark admin layout", () => {
    render(
      React.createElement(AdminAccountsView, {
        users: [
          {
            accessLevel: "READ",
            approvalStatus: "PENDING",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            username: "Mako"
          }
        ]
      })
    );

    expect(screen.getByRole("main").className).toContain("history-page--dark");
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByLabelText("Access for Mako")).toHaveProperty("value", "READ");
    expect(screen.getByRole("checkbox", { name: "Admin for Mako" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Mako" })).toBeTruthy();
    expect(screen.getByLabelText("New password for Mako")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password Mako" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Mako" })).toBeTruthy();
  });

  it("saves privilege changes through the admin users API", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        user: {
          accessLevel: "WRITE",
          approvalStatus: "APPROVED",
          createdAt: "2026-05-10T00:00:00.000Z",
          id: "user-1",
          isAdmin: true,
          username: "Mako"
        }
      }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(AdminAccountsView, {
        users: [
          {
            accessLevel: "READ",
            approvalStatus: "PENDING",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            username: "Mako"
          }
        ]
      })
    );

    fireEvent.change(screen.getByLabelText("Access for Mako"), { target: { value: "WRITE" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Admin for Mako" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Mako" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      {
        body: JSON.stringify({ accessLevel: "WRITE", isAdmin: true }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("changes a user password through the admin password API", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        user: {
          accessLevel: "READ",
          approvalStatus: "APPROVED",
          createdAt: "2026-05-10T00:00:00.000Z",
          id: "user-1",
          isAdmin: false,
          username: "Mako"
        }
      }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(AdminAccountsView, {
        users: [
          {
            accessLevel: "READ",
            approvalStatus: "APPROVED",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            username: "Mako"
          }
        ]
      })
    );

    fireEvent.change(screen.getByLabelText("New password for Mako"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password Mako" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user-1/password",
      {
        body: JSON.stringify({ password: "new-secure-password" }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
    expect(screen.getByLabelText("New password for Mako")).toHaveProperty("value", "");
  });

  it("removes deleted users from the account management table", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ userId: "user-1" }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(AdminAccountsView, {
        users: [
          {
            accessLevel: "READ",
            approvalStatus: "APPROVED",
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "user-1",
            isAdmin: false,
            username: "Mako"
          }
        ]
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Mako" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user-1",
      { method: "DELETE" }
    ));
    expect(screen.queryByText("Mako")).toBeNull();
    expect(screen.getByText("No accounts yet")).toBeTruthy();
  });

  it("renders access denied in the admin layout", () => {
    render(React.createElement(AdminAccountsAccessDenied, { message: "Admin access is required" }));

    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
    expect(screen.getByText("Admin access is required")).toBeTruthy();
  });
});
