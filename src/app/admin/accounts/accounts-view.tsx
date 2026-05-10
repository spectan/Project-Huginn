"use client";

import { useState, type FormEvent } from "react";
import type { AdminUserSummary } from "@/lib/admin/users";

type AdminAccountsViewProps = {
  users: AdminUserSummary[];
};

export function AdminAccountsView({ users }: AdminAccountsViewProps) {
  const [accountUsers, setAccountUsers] = useState(users);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="history-page history-page--dark">
      <header className="history-header">
        <div>
          <p>Admin</p>
          <h1>Accounts</h1>
        </div>
        <a href="/map">Map</a>
      </header>
      {error !== null ? <section className="history-empty">{error}</section> : null}
      {accountUsers.length === 0 ? (
        <section className="history-empty">No accounts yet</section>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Status</th>
                <th>Access</th>
                <th>Admin</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountUsers.map((user) => (
                <AdminAccountRow
                  key={user.id}
                  onError={setError}
                  onUserChange={(nextUser) => setAccountUsers((current) => upsertAdminUser(current, nextUser))}
                  user={user}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export function AdminAccountsAccessDenied({ message }: { message: string }) {
  return (
    <main className="history-page history-page--dark">
      <header className="history-header">
        <div>
          <p>Admin</p>
          <h1>Accounts</h1>
        </div>
        <a href="/map">Map</a>
      </header>
      <section className="history-empty">{message}</section>
    </main>
  );
}

function AdminAccountRow({
  onError,
  onUserChange,
  user
}: {
  onError(error: string | null): void;
  onUserChange(user: AdminUserSummary): void;
  user: AdminUserSummary;
}) {
  return (
    <tr>
      <td>{user.username}</td>
      <td>{formatApprovalStatus(user.approvalStatus)}</td>
      <td>
        <select
          aria-label={`Access for ${user.username}`}
          className="history-select"
          defaultValue={user.accessLevel}
          name="accessLevel"
          form={`account-form-${user.id}`}
        >
          <option value="NONE">None</option>
          <option value="READ">Read</option>
          <option value="WRITE">Write</option>
        </select>
      </td>
      <td>
        <label className="history-check">
          <input
            aria-label={`Admin for ${user.username}`}
            defaultChecked={user.isAdmin}
            form={`account-form-${user.id}`}
            name="isAdmin"
            type="checkbox"
          />
          <span>Admin</span>
        </label>
      </td>
      <td>
        <time dateTime={user.createdAt}>{formatTimestamp(user.createdAt)}</time>
      </td>
      <td>
        <form
          className="history-row-actions"
          id={`account-form-${user.id}`}
          onSubmit={(event) => void updateAdminUser(event, user.id, onUserChange, onError)}
        >
          <button aria-label={`Save ${user.username}`} className="history-action-button" type="submit">
            Save
          </button>
          <button
            aria-label={`Remove ${user.username}`}
            className="history-action-button history-action-button--danger"
            onClick={() => void removeAdminUser(user.id, onUserChange, onError)}
            type="button"
          >
            Remove
          </button>
        </form>
      </td>
    </tr>
  );
}

async function updateAdminUser(
  event: FormEvent<HTMLFormElement>,
  userId: string,
  onUserChange: (user: AdminUserSummary) => void,
  onError: (error: string | null) => void
): Promise<void> {
  event.preventDefault();
  onError(null);

  const formData = new FormData(event.currentTarget);
  const response = await fetch(`/api/admin/users/${userId}`, {
    body: JSON.stringify({
      accessLevel: formData.get("accessLevel"),
      isAdmin: formData.get("isAdmin") === "on"
    }),
    headers: { "content-type": "application/json" },
    method: "PATCH"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    onError(body?.error ?? "Account could not be updated");
    return;
  }

  const body = (await response.json()) as { user: AdminUserSummary };
  onUserChange(body.user);
}

async function removeAdminUser(
  userId: string,
  onUserChange: (user: AdminUserSummary) => void,
  onError: (error: string | null) => void
): Promise<void> {
  onError(null);

  const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    onError(body?.error ?? "Account could not be removed");
    return;
  }

  const body = (await response.json()) as { user: AdminUserSummary };
  onUserChange(body.user);
}

function upsertAdminUser(users: AdminUserSummary[], user: AdminUserSummary): AdminUserSummary[] {
  return users.map((candidate) => (candidate.id === user.id ? user : candidate));
}

function formatApprovalStatus(status: AdminUserSummary["approvalStatus"]): string {
  if (status === "APPROVED") {
    return "Approved";
  }

  if (status === "REJECTED") {
    return "Rejected";
  }

  return "Pending";
}

function formatTimestamp(value: string): string {
  return value.replace("T", " ").replace(".000Z", " UTC");
}
