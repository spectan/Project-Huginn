"use client";

import { useState, type FormEvent } from "react";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { canAdminister, canReadMap, canWriteMarkers } from "@/lib/domain/permissions";

export type AccountViewer = {
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isAdmin: boolean;
  pendingApprovalCount: number;
  permissions: "NONE" | "READ" | "WRITE";
  username: string;
};

type AccountOverlayProps = {
  isOpen: boolean;
  onOpenChange(isOpen: boolean): void;
  viewer: AccountViewer | null;
};

export function AccountOverlay({ isOpen, onOpenChange, viewer }: AccountOverlayProps) {
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
          <AccountPermissions viewer={viewer} />
          {viewer.isAdmin ? (
            <>
              <a
                aria-label={`Accounts ${viewer.pendingApprovalCount} pending`}
                className="map-account-admin-link"
                href="/admin/accounts"
              >
                <span>Accounts</span>
                <span>{viewer.pendingApprovalCount} pending</span>
              </a>
              <a className="map-account-admin-link" href="/admin/history">
                History log
              </a>
              <a className="map-account-admin-link" href="/admin/deleted-markers">
                Deleted markers
              </a>
            </>
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

function AccountPermissions({ viewer }: { viewer: AccountViewer }) {
  const access = {
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin
  };
  const permissionRows = getAccountPermissionRows(access);

  return (
    <fieldset className="map-account-permissions">
      <legend>Permissions</legend>
      <dl className="map-account-list map-account-permissions-list">
        {permissionRows.map((row) => (
          <PermissionRow allowed={row.allowed} key={row.label} label={row.label} />
        ))}
      </dl>
    </fieldset>
  );
}

function getAccountPermissionRows(access: {
  accessLevel: AccountViewer["permissions"];
  approvalStatus: AccountViewer["approvalStatus"];
  isAdmin: boolean;
}): Array<{ allowed: boolean; label: string }> {
  const rows: Array<{ allowed: boolean; label: string }> = [];

  if (canWriteMarkers(access)) {
    rows.push({ allowed: true, label: "Read/Write" });
  } else if (canReadMap(access)) {
    rows.push({ allowed: true, label: "Read" });
  } else {
    rows.push({ allowed: false, label: "Read" });
  }

  if (canAdminister(access)) {
    rows.push({ allowed: true, label: "Admin" });
  }

  return rows;
}

function PermissionRow({ allowed, label }: { allowed: boolean; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={allowed ? "map-account-permission--allowed" : "map-account-permission--denied"}>
        {allowed ? "Allowed" : "Denied"}
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
