"use client";

import { useState, type FormEvent } from "react";

export type AccountViewer = {
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isAdmin: boolean;
  pendingApprovalCount: number;
  permissions: "NONE" | "READ" | "WRITE";
  username: string;
};

type AccountOverlayProps = {
  viewer: AccountViewer | null;
};

export function AccountOverlay({ viewer }: AccountOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);

  if (viewer === null) {
    return (
      <div className="map-account">
        <button className="map-account-button" onClick={() => setIsOpen(true)} type="button">
          Log in
        </button>
        {isOpen ? (
          <AuthDialog
            error={authError}
            mode={authMode}
            onClose={() => setIsOpen(false)}
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
        onClick={() => setIsOpen((current) => !current)}
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
              onClick={() => setIsOpen(false)}
              type="button"
            >
              x
            </button>
          </div>
          <dl className="map-account-list">
            <div>
              <dt>Status</dt>
              <dd>{formatApprovalStatus(viewer.approvalStatus)}</dd>
            </div>
            <div>
              <dt>Read access</dt>
              <dd>{viewer.permissions === "NONE" ? "Disabled" : "Enabled"}</dd>
            </div>
            <div>
              <dt>Write access</dt>
              <dd>{viewer.permissions === "WRITE" ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Admin</dt>
              <dd>{viewer.isAdmin ? "Enabled" : "Disabled"}</dd>
            </div>
          </dl>
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
          <button className="map-account-logout" onClick={() => void logout()} type="button">
            Log out
          </button>
        </section>
      ) : null}
    </div>
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

async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.reload();
}

function formatApprovalStatus(status: AccountViewer["approvalStatus"]): string {
  if (status === "APPROVED") {
    return "Approved";
  }

  if (status === "REJECTED") {
    return "Rejected";
  }

  return "Pending";
}
