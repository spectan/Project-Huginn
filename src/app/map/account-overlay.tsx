"use client";

import { useState, type FormEvent } from "react";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { canAdminister, canManageAccounts, canReadMap, canWriteMarkers, type MapPermission } from "@/lib/domain/permissions";

export type AccountViewer = {
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isAdmin: boolean;
  mapPermissions?: readonly MapPermission[];
  pendingApprovalCount: number;
  permissions: "NONE" | "READ" | "WRITE";
  username: string;
};

type AccountOverlayProps = {
  isOpen: boolean;
  onOpenChange(isOpen: boolean): void;
  servers?: readonly AccountPermissionServer[];
  viewer: AccountViewer | null;
};

type AccountPermissionServer = {
  id: string;
  name: string;
};

export function AccountOverlay({ isOpen, onOpenChange, servers = [], viewer }: AccountOverlayProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (viewer === null) {
    return (
      <div className="map-account">
        <button className="map-account-button" onClick={() => onOpenChange(true)} type="button">
          Log in
        </button>
        {isOpen ? (
          <AuthDialog
            error={authError}
            mode={authMode}
            onClose={() => onOpenChange(false)}
            onModeChange={setAuthMode}
            onSubmit={(event) => void submitAuthForm(event, authMode, setAuthError)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="map-account">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="map-account-button"
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        {viewer.username}
      </button>
      {isOpen ? (
        <section className="map-account-panel" role="dialog" aria-label="Account settings">
          <div className="map-account-panel-header">
            <strong>{viewer.username}</strong>
            <button
              aria-label="Close account settings"
              className="map-account-close"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              x
            </button>
          </div>
          <AccountPermissions servers={servers} viewer={viewer} />
          {canManageAccounts({
            accessLevel: viewer.permissions,
            approvalStatus: viewer.approvalStatus,
            isAdmin: viewer.isAdmin,
            mapPermissions: viewer.mapPermissions ?? []
          }) ? (
            <a
              aria-label={
                viewer.pendingApprovalCount > 0
                  ? `Administration ${viewer.pendingApprovalCount} pending`
                  : "Administration"
              }
              className="map-account-administration-button"
              href="/admin"
            >
              <span>Administration</span>
              {viewer.pendingApprovalCount > 0 ? (
                <span>{viewer.pendingApprovalCount} pending</span>
              ) : null}
            </a>
          ) : null}
          <button
            className="map-account-admin-button"
            onClick={() => {
              setIsPasswordFormOpen((current) => !current);
              setPasswordError(null);
              setPasswordSuccess(null);
            }}
            type="button"
          >
            Change password
          </button>
          {isPasswordFormOpen ? (
            <PasswordChangeForm
              error={passwordError}
              onSubmit={(event) => void submitPasswordChangeForm(event, setPasswordError, setPasswordSuccess)}
              success={passwordSuccess}
            />
          ) : null}
          <button className="map-account-logout" onClick={() => void logout()} type="button">
            Log out
          </button>
          <p className="map-account-version">{APP_VERSION_LABEL}</p>
        </section>
      ) : null}
    </div>
  );
}

function AccountPermissions({
  servers,
  viewer
}: {
  servers: readonly AccountPermissionServer[];
  viewer: AccountViewer;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const access = {
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin,
    mapPermissions: viewer.mapPermissions ?? []
  };
  const permissionRows = getAccountPermissionRows(access, servers);

  return (
    <fieldset className="map-account-permissions">
      <legend
        className="map-account-permissions-legend"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <button
          aria-expanded={isExpanded}
          className="map-account-permissions-toggle"
          type="button"
        >
          Permissions
        </button>
      </legend>
      <dl
        className={[
          "map-account-list map-account-permissions-list",
          !isExpanded ? "map-account-permissions-list--collapsed" : ""
        ].join(" ").trim()}
      >
        {permissionRows.map((row) => (
          <PermissionRow
            allowed={row.allowed}
            isGlobal={row.isGlobal}
            key={row.label}
            label={row.label}
            value={row.value}
          />
        ))}
      </dl>
    </fieldset>
  );
}

function getAccountPermissionRows(
  access: {
    accessLevel: AccountViewer["permissions"];
    approvalStatus: AccountViewer["approvalStatus"];
    isAdmin: boolean;
    mapPermissions: readonly MapPermission[];
  },
  servers: readonly AccountPermissionServer[]
): Array<{ allowed: boolean; isGlobal: boolean; label: string; value: string }> {
  if (servers.length > 0) {
    const perServer = servers
      .map((server) => ({ label: server.name, value: getServerPermissionLabel(access, server.id) }))
      .filter((row) => row.value !== null);

    const firstRow = perServer[0];

    if (firstRow !== undefined && perServer.every((row) => row.value === firstRow.value)) {
      return [{ allowed: true, isGlobal: true, label: "Global", value: firstRow.value! }];
    }

    return perServer.map((row) => ({ allowed: true, isGlobal: false, label: row.label, value: row.value! }));
  }

  const fallbackValue = getFallbackPermissionLabel(access);

  return fallbackValue === null ? [] : [{ allowed: true, isGlobal: true, label: "Global", value: fallbackValue }];
}

function getServerPermissionLabel(access: {
  accessLevel: AccountViewer["permissions"];
  approvalStatus: AccountViewer["approvalStatus"];
  isAdmin: boolean;
  mapPermissions: readonly MapPermission[];
}, mapId: string): string | null {
  if (canAdminister(access, mapId)) {
    return access.isAdmin ? "Admin" : "Operator";
  }

  if (canWriteMarkers(access, mapId)) {
    return "Read/Write";
  }

  if (canReadMap(access, mapId)) {
    return "Read";
  }

  return null;
}

function getFallbackPermissionLabel(access: {
  accessLevel: AccountViewer["permissions"];
  approvalStatus: AccountViewer["approvalStatus"];
  isAdmin: boolean;
  mapPermissions: readonly MapPermission[];
}): string | null {
  if (canAdminister(access)) {
    return "Admin";
  }

  if (canWriteMarkers(access)) {
    return "Read/Write";
  }

  if (canReadMap(access)) {
    return "Read";
  }

  return null;
}

function PermissionRow({
  allowed,
  isGlobal = false,
  label,
  value
}: {
  allowed: boolean;
  isGlobal?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={isGlobal ? "map-account-permission--global" : undefined}>
      <dt>{label}</dt>
      <dd className={allowed ? "map-account-permission--allowed" : "map-account-permission--denied"}>
        {value}
      </dd>
    </div>
  );
}

function PasswordChangeForm({
  error,
  onSubmit,
  success
}: {
  error: string | null;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  success: string | null;
}) {
  return (
    <form className="map-auth-form map-account-password-form" onSubmit={onSubmit}>
      <label>
        <span>Current password</span>
        <input autoComplete="current-password" name="currentPassword" required type="password" />
      </label>
      <label>
        <span>New password</span>
        <input autoComplete="new-password" minLength={12} name="newPassword" required type="password" />
      </label>
      <label>
        <span>Confirm new password</span>
        <input autoComplete="new-password" minLength={12} name="confirmPassword" required type="password" />
      </label>
      {error !== null ? <p className="map-auth-error">{error}</p> : null}
      {success !== null ? <p className="map-auth-success">{success}</p> : null}
      <button className="map-account-admin-button" type="submit">
        Save password
      </button>
    </form>
  );
}

function AuthDialog({
  error,
  mode,
  onClose,
  onModeChange,
  onSubmit
}: {
  error: string | null;
  mode: "login" | "register";
  onClose(): void;
  onModeChange(mode: "login" | "register"): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const title = mode === "login" ? "Log in" : "Create account";

  return (
    <section className="map-account-panel" role="dialog" aria-label={title}>
      <div className="map-account-panel-header">
        <strong>{title}</strong>
        <button
          aria-label="Close login"
          className="map-account-close"
          onClick={onClose}
          type="button"
        >
          x
        </button>
      </div>
      <form className="map-auth-form" onSubmit={onSubmit}>
        <label>
          <span>Username</span>
          <input autoComplete="username" name="username" required />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </label>
        {error !== null ? <p className="map-auth-error">{error}</p> : null}
        <button className="map-account-admin-button" type="submit">
          {mode === "login" ? "Log in" : "Register"}
        </button>
      </form>
      {mode === "login" ? (
        <button
          className="map-auth-secondary"
          onClick={() => onModeChange("register")}
          type="button"
        >
          Create account
        </button>
      ) : (
        <button className="map-auth-secondary" onClick={() => onModeChange("login")} type="button">
          Back to login
        </button>
      )}
    </section>
  );
}

async function submitAuthForm(
  event: FormEvent<HTMLFormElement>,
  mode: "login" | "register",
  setAuthError: (error: string | null) => void
): Promise<void> {
  event.preventDefault();
  setAuthError(null);

  const formData = new FormData(event.currentTarget);
  const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
    body: JSON.stringify({
      password: formData.get("password"),
      username: formData.get("username")
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setAuthError(body?.error ?? "Authentication failed");
    return;
  }

  window.location.reload();
}

async function submitPasswordChangeForm(
  event: FormEvent<HTMLFormElement>,
  setPasswordError: (error: string | null) => void,
  setPasswordSuccess: (success: string | null) => void
): Promise<void> {
  event.preventDefault();
  setPasswordError(null);
  setPasswordSuccess(null);

  const form = event.currentTarget;
  const formData = new FormData(form);
  const response = await fetch("/api/auth/password", {
    body: JSON.stringify({
      confirmPassword: formData.get("confirmPassword"),
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword")
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "PATCH"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setPasswordError(body?.error ?? "Password change failed");
    return;
  }

  form.reset();
  setPasswordSuccess("Password changed");
}

async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.reload();
}
