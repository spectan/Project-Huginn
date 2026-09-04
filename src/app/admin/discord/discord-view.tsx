"use client";

import { useEffect, useState } from "react";

type DiscordConfig = {
  webhookUrl: string;
  enabled: boolean;
  alertSeverityHigh: boolean;
  alertSeverityMedium: boolean;
  alertSeverityLow: boolean;
  notifyRegistrations: boolean;
  notifyApprovals: boolean;
  notifyMarkerCreated: boolean;
  notifyMarkerUpdated: boolean;
  notifyMarkerDeleted: boolean;
  notifyShareLinks: boolean;
};

type Feedback = {
  kind: "success" | "error";
  message: string;
};

function FeedbackPill({ feedback }: { feedback: Feedback }) {
  const modifier = feedback.kind === "error" ? "admin-pill--danger" : "admin-pill--approved";
  return <span className={`admin-pill ${modifier}`}>{feedback.message}</span>;
}

function Toggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="admin-check">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

export function DiscordView() {
  const [config, setConfig] = useState<DiscordConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<Feedback | null>(null);
  const [testFeedback, setTestFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/discord")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load Discord settings");
        return ((await response.json()) as { config: DiscordConfig }).config;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<DiscordConfig>) => {
    setConfig((current) => (current === null ? current : { ...current, ...patch }));
  };

  const save = async () => {
    if (config === null) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      const response = await fetch("/api/admin/discord", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setSaveFeedback({ kind: "error", message: body.error ?? "Failed to save settings" });
        return;
      }
      setConfig(((await response.json()) as { config: DiscordConfig }).config);
      setSaveFeedback({ kind: "success", message: "Saved ✓" });
    } catch (e) {
      setSaveFeedback({ kind: "error", message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSendingTest(true);
    setTestFeedback(null);
    try {
      const response = await fetch("/api/admin/discord/test", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setTestFeedback({ kind: "error", message: body.error ?? "Failed to send test message" });
        return;
      }
      setTestFeedback({ kind: "success", message: "Test message sent" });
    } catch (e) {
      setTestFeedback({ kind: "error", message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <h1 className="admin-page-title">Discord</h1>

      {loadError !== null ? <section className="admin-empty">{loadError}</section> : null}
      {config === null && loadError === null ? (
        <section className="admin-empty">Loading…</section>
      ) : null}

      {config !== null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="admin-discord-grid">
            <section className="admin-panel">
              <h2 className="admin-section-title">Connection</h2>

              <label className="admin-discord-field">
                <span>Webhook URL</span>
                <input
                  className="admin-input"
                  onChange={(event) => update({ webhookUrl: event.target.value })}
                  placeholder="https://discord.com/api/webhooks/…"
                  type="url"
                  value={config.webhookUrl}
                />
              </label>

              <div className="admin-discord-enabled">
                <label className="admin-check">
                  <input
                    checked={config.enabled}
                    onChange={(event) => update({ enabled: event.target.checked })}
                    type="checkbox"
                  />
                  <span>Enabled</span>
                </label>
                <span className="admin-discord-enabled-hint">
                  Post notifications to this webhook
                </span>
              </div>

              <div className="admin-toolbar admin-discord-actions">
                <button className="admin-btn" disabled={saving || sendingTest} type="submit">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="admin-btn admin-btn--ghost"
                  disabled={saving || sendingTest}
                  onClick={() => void sendTest()}
                  type="button"
                >
                  {sendingTest ? "Sending…" : "Send test message"}
                </button>
              </div>

              {saveFeedback !== null || testFeedback !== null ? (
                <div className="admin-discord-feedback">
                  {saveFeedback !== null ? <FeedbackPill feedback={saveFeedback} /> : null}
                  {testFeedback !== null ? <FeedbackPill feedback={testFeedback} /> : null}
                </div>
              ) : null}
            </section>

            <section className="admin-panel">
              <h2 className="admin-section-title">Notifications</h2>

              <div className="admin-discord-group">
                <span className="admin-discord-group__label">Security alerts</span>
                <div className="admin-toggle-grid">
                  <Toggle
                    checked={config.alertSeverityHigh}
                    label="High"
                    onChange={(checked) => update({ alertSeverityHigh: checked })}
                  />
                  <Toggle
                    checked={config.alertSeverityMedium}
                    label="Medium"
                    onChange={(checked) => update({ alertSeverityMedium: checked })}
                  />
                  <Toggle
                    checked={config.alertSeverityLow}
                    label="Low"
                    onChange={(checked) => update({ alertSeverityLow: checked })}
                  />
                </div>
              </div>

              <div className="admin-discord-group">
                <span className="admin-discord-group__label">Account events</span>
                <div className="admin-toggle-grid">
                  <Toggle
                    checked={config.notifyRegistrations}
                    label="New registrations"
                    onChange={(checked) => update({ notifyRegistrations: checked })}
                  />
                  <Toggle
                    checked={config.notifyApprovals}
                    label="Account approvals"
                    onChange={(checked) => update({ notifyApprovals: checked })}
                  />
                </div>
              </div>

              <div className="admin-discord-group">
                <span className="admin-discord-group__label">Marker activity</span>
                <div className="admin-toggle-grid">
                  <Toggle
                    checked={config.notifyMarkerCreated}
                    label="Created"
                    onChange={(checked) => update({ notifyMarkerCreated: checked })}
                  />
                  <Toggle
                    checked={config.notifyMarkerUpdated}
                    label="Updated"
                    onChange={(checked) => update({ notifyMarkerUpdated: checked })}
                  />
                  <Toggle
                    checked={config.notifyMarkerDeleted}
                    label="Deleted"
                    onChange={(checked) => update({ notifyMarkerDeleted: checked })}
                  />
                </div>
              </div>

              <div className="admin-discord-group">
                <span className="admin-discord-group__label">Share links</span>
                <div className="admin-toggle-grid">
                  <Toggle
                    checked={config.notifyShareLinks}
                    label="Share link created"
                    onChange={(checked) => update({ notifyShareLinks: checked })}
                  />
                </div>
              </div>
            </section>
          </div>
        </form>
      ) : null}
    </>
  );
}
