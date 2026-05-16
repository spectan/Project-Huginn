"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { AdminMapSummary, AdminUserSummary } from "@/lib/admin/users";

type AdminAccountsViewProps = {
  maps: AdminMapSummary[];
  users: AdminUserSummary[];
  viewerCanManageGlobalAccounts: boolean;
};

type AccessLevelValue = AdminUserSummary["mapPermissions"][number]["accessLevel"];
type AccessLevelByMap = Record<string, AccessLevelValue>;
type OperatorByMap = Record<string, boolean>;

export function AdminAccountsView({ maps, users, viewerCanManageGlobalAccounts }: AdminAccountsViewProps) {
  const [accountUsers, setAccountUsers] = useState(users);
  const [error, setError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const normalizedUserSearchQuery = userSearchQuery.trim().toLowerCase();
  const visibleAccountUsers = normalizedUserSearchQuery.length === 0
    ? accountUsers
    : accountUsers.filter((user) => user.username.toLowerCase().includes(normalizedUserSearchQuery));

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
      <label className="accounts-user-search">
        <span>Search users</span>
        <input
          className="history-text-input"
          onChange={(event) => setUserSearchQuery(event.currentTarget.value)}
          placeholder="Search users"
          type="search"
          value={userSearchQuery}
        />
      </label>
      {accountUsers.length === 0 ? (
        <section className="history-empty">No accounts yet</section>
      ) : visibleAccountUsers.length === 0 ? (
        <section className="history-empty">No accounts match your search</section>
      ) : (
        <div className="accounts-admin-list">
          {visibleAccountUsers.map((user) => (
            <AdminAccountCard
              key={createAdminAccountCardKey(user)}
              maps={maps}
              onError={setError}
              onUserChange={(nextUser) => setAccountUsers((current) => upsertAdminUser(current, nextUser))}
              onUserRemove={(userId) => setAccountUsers((current) => current.filter((candidate) => candidate.id !== userId))}
              user={user}
              viewerCanManageGlobalAccounts={viewerCanManageGlobalAccounts}
            />
          ))}
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

function AdminAccountCard({
  maps,
  onError,
  onUserChange,
  onUserRemove,
  user,
  viewerCanManageGlobalAccounts
}: {
  maps: AdminMapSummary[];
  onError(error: string | null): void;
  onUserChange(user: AdminUserSummary): void;
  onUserRemove(userId: string): void;
  user: AdminUserSummary;
  viewerCanManageGlobalAccounts: boolean;
}) {
  const accountFormId = `account-form-${user.id}`;
  const permissionPanelId = `account-permissions-${user.id}`;
  const [accessLevels, setAccessLevels] = useState<AccessLevelByMap>(() => createAccessLevelState(maps, user));
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(user.isAdmin);
  const [operatorFlags, setOperatorFlags] = useState<OperatorByMap>(() => createOperatorState(maps, user));
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const titleId = `account-title-${user.id}`;

  return (
    <article aria-labelledby={titleId} className="accounts-user-card">
      <div className="accounts-user-header">
        <div className="accounts-user-identity">
          <h2 id={titleId}>{user.username}</h2>
          <div className="accounts-user-meta">
            <span className={`accounts-status accounts-status--${user.approvalStatus.toLowerCase()}`}>
              {formatApprovalStatus(user.approvalStatus)}
            </span>
          </div>
        </div>

        {viewerCanManageGlobalAccounts ? (
          <label className="accounts-admin-check history-check">
            <input
              aria-label={`Admin for ${user.username}`}
              checked={isGlobalAdmin}
              form={accountFormId}
              name="isAdmin"
              onChange={(event) => setIsGlobalAdmin(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Admin</span>
          </label>
        ) : null}

        <form
          className="accounts-card-actions"
          id={accountFormId}
          onSubmit={(event) => void updateAdminUser(
            event,
            user.id,
            maps,
            viewerCanManageGlobalAccounts,
            isGlobalAdmin,
            accessLevels,
            operatorFlags,
            onUserChange,
            onError
          )}
        >
          <button aria-label={`Save ${user.username}`} className="history-action-button" type="submit">
            Save
          </button>
          {viewerCanManageGlobalAccounts ? (
            <button
              aria-label={`Remove ${user.username}`}
              className="history-action-button history-action-button--danger"
              onClick={() => void removeAdminUser(user.id, onUserRemove, onError)}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </form>
      </div>

      <div className="accounts-permission-controls">
        <button
          aria-controls={permissionPanelId}
          aria-expanded={permissionsOpen}
          aria-label={`${permissionsOpen ? "Hide" : "Show"} server permissions for ${user.username}`}
          className="accounts-permission-toggle"
          onClick={() => setPermissionsOpen((current) => !current)}
          type="button"
        >
          {permissionsOpen ? "Hide servers" : "Show servers"}
        </button>
      </div>

      {permissionsOpen ? (
        <div
          aria-label={`Server permissions for ${user.username}`}
          className="accounts-permission-panel"
          id={permissionPanelId}
          role="group"
        >
          <label className="accounts-bulk-access">
            <span>Set all access</span>
            <select
              aria-label={`Set all server access for ${user.username}`}
              className="history-select"
              onChange={(event) => setAllAccessLevels(event, maps, setAccessLevels)}
              value=""
            >
              <option value="">Choose</option>
              <option value="NONE">None</option>
              <option value="READ">Read</option>
              <option value="WRITE">Write</option>
            </select>
          </label>
          <div className="accounts-permission-pairs">
            {maps.map((map) => (
              <div className="accounts-server-setting" key={map.id}>
                <div className="accounts-server-name">
                  <span>Server</span>
                  <strong>{map.name}</strong>
                </div>
                <label className="accounts-server-control">
                  <span>Access</span>
                  <select
                    aria-label={`Access for ${user.username} on ${map.name}`}
                    className="history-select accounts-permission-select"
                    form={accountFormId}
                    name={`accessLevel:${map.id}`}
                    onChange={(event) => updateAccessLevel(map.id, event.currentTarget.value, setAccessLevels)}
                    value={accessLevels[map.id] ?? "NONE"}
                  >
                    <option value="NONE">None</option>
                    <option value="READ">Read</option>
                    <option value="WRITE">Write</option>
                  </select>
                </label>
                <label className="history-check accounts-operator-check">
                  <input
                    aria-label={`Operator for ${user.username} on ${map.name}`}
                    checked={isGlobalAdmin || (operatorFlags[map.id] ?? false)}
                    disabled={isGlobalAdmin}
                    form={accountFormId}
                    name={`isOperator:${map.id}`}
                    onChange={(event) => updateOperatorFlag(map.id, event.currentTarget.checked, setOperatorFlags)}
                    type="checkbox"
                  />
                  <span>Operator</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="accounts-footer-row">
        {viewerCanManageGlobalAccounts ? (
          <form
            className="accounts-password-form"
            onSubmit={(event) => void updateAdminUserPassword(event, user.id, onUserChange, onError)}
          >
            <span>Password</span>
            <input
              aria-label={`New password for ${user.username}`}
              autoComplete="new-password"
              className="history-text-input"
              maxLength={128}
              minLength={12}
              name="password"
              type="password"
            />
            <button aria-label={`Change password ${user.username}`} className="history-action-button" type="submit">
              Change
            </button>
          </form>
        ) : null}
        <div className="accounts-user-audit">
          <time dateTime={user.createdAt}>Created {formatTimestamp(user.createdAt)}</time>
          <span>Approved by - {user.approvedByUsername ?? "Unknown"}</span>
        </div>
      </div>
    </article>
  );
}

function createAdminAccountCardKey(user: AdminUserSummary): string {
  const permissionKey = user.mapPermissions
    .map((permission) => `${permission.mapId}:${permission.accessLevel}:${permission.isOperator}`)
    .join("|");

  return `${user.id}:${user.isAdmin}:${user.approvalStatus}:${permissionKey}`;
}

function createAccessLevelState(maps: readonly AdminMapSummary[], user: AdminUserSummary): AccessLevelByMap {
  return Object.fromEntries(
    maps.map((map) => [
      map.id,
      user.mapPermissions.find((permission) => permission.mapId === map.id)?.accessLevel ?? "NONE"
    ])
  ) as AccessLevelByMap;
}

function createOperatorState(maps: readonly AdminMapSummary[], user: AdminUserSummary): OperatorByMap {
  return Object.fromEntries(
    maps.map((map) => [
      map.id,
      user.mapPermissions.find((permission) => permission.mapId === map.id)?.isOperator ?? false
    ])
  );
}

function setAllAccessLevels(
  event: ChangeEvent<HTMLSelectElement>,
  maps: readonly AdminMapSummary[],
  setAccessLevels: (updater: AccessLevelByMap) => void
): void {
  const accessLevel = parseAccessLevel(event.currentTarget.value);

  if (accessLevel === null) {
    return;
  }

  setAccessLevels(Object.fromEntries(maps.map((map) => [map.id, accessLevel])) as AccessLevelByMap);
}

function updateAccessLevel(
  mapId: string,
  value: string,
  setAccessLevels: (updater: (current: AccessLevelByMap) => AccessLevelByMap) => void
): void {
  const accessLevel = parseAccessLevel(value);

  if (accessLevel === null) {
    return;
  }

  setAccessLevels((current) => ({
    ...current,
    [mapId]: accessLevel
  }));
}

function updateOperatorFlag(
  mapId: string,
  checked: boolean,
  setOperatorFlags: (updater: (current: OperatorByMap) => OperatorByMap) => void
): void {
  setOperatorFlags((current) => ({
    ...current,
    [mapId]: checked
  }));
}

function parseAccessLevel(value: string): AccessLevelValue | null {
  if (value === "NONE" || value === "READ" || value === "WRITE") {
    return value;
  }

  return null;
}

async function updateAdminUser(
  event: FormEvent<HTMLFormElement>,
  userId: string,
  maps: AdminMapSummary[],
  viewerCanManageGlobalAccounts: boolean,
  isGlobalAdmin: boolean,
  accessLevels: AccessLevelByMap,
  operatorFlags: OperatorByMap,
  onUserChange: (user: AdminUserSummary) => void,
  onError: (error: string | null) => void
): Promise<void> {
  event.preventDefault();
  onError(null);

  const mapPermissions = maps.map((map) => ({
    accessLevel: accessLevels[map.id] ?? "NONE",
    isOperator: operatorFlags[map.id] ?? false,
    mapId: map.id
  }));
  const response = await fetch(`/api/admin/users/${userId}`, {
    body: JSON.stringify({
      isAdmin: viewerCanManageGlobalAccounts ? isGlobalAdmin : false,
      mapPermissions
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

async function updateAdminUserPassword(
  event: FormEvent<HTMLFormElement>,
  userId: string,
  onUserChange: (user: AdminUserSummary) => void,
  onError: (error: string | null) => void
): Promise<void> {
  event.preventDefault();
  onError(null);

  const form = event.currentTarget;
  const formData = new FormData(form);
  const response = await fetch(`/api/admin/users/${userId}/password`, {
    body: JSON.stringify({
      password: formData.get("password")
    }),
    headers: { "content-type": "application/json" },
    method: "PATCH"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    onError(body?.error ?? "Password could not be changed");
    return;
  }

  const body = (await response.json()) as { user: AdminUserSummary };
  onUserChange(body.user);
  form.reset();
}

async function removeAdminUser(
  userId: string,
  onUserRemove: (userId: string) => void,
  onError: (error: string | null) => void
): Promise<void> {
  onError(null);

  const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    onError(body?.error ?? "Account could not be removed");
    return;
  }

  const body = (await response.json().catch(() => null)) as { userId?: string } | null;
  onUserRemove(body?.userId ?? userId);
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
