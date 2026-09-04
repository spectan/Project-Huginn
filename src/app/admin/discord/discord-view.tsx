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
};

type Feedback = {
  kind: "success" | "error";
  message: string;
};

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === "error") {
    return <span className="admin-pill admin-pill--danger">{feedback.message}</span>;
  }
  return <span>{feedback.message}</span>;
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
      {config === null && loadError === null ? <p>Loading…</p> : null}

      {config !== null ? (
        <section className="admin-panel">
          <h2 className="admin-section-title">Webhook</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <p>
              <label>
                Webhook URL{" "}
                <input
                  className="admin-input"
                  onChange={(event) => update({ webhookUrl: event.target.value })}
                  placeholder="https://discord.com/api/webhooks/…"
                  type="url"
                  value={config.webhookUrl}
                />
              </label>
            </p>
            <p>
              <label className="admin-check">
                <input
                  checked={config.enabled}
                  onChange={(event) => update({ enabled: event.target.checked })}
                  type="checkbox"
                />
                <span>Enabled</span>
              </label>
            </p>

            <h2 className="admin-section-title">Security alerts</h2>
            <p>
              <label className="admin-check">
                <input
                  checked={config.alertSeverityHigh}
                  onChange={(event) => update({ alertSeverityHigh: event.target.checked })}
                  type="checkbox"
                />
                <span>High</span>
              </label>{" "}
              <label className="admin-check">
                <input
                  checked={config.alertSeverityMedium}
                  onChange={(event) => update({ alertSeverityMedium: event.target.checked })}
                  type="checkbox"
                />
                <span>Medium</span>
              </label>{" "}
              <label className="admin-check">
                <input
                  checked={config.alertSeverityLow}
                  onChange={(event) => update({ alertSeverityLow: event.target.checked })}
                  type="checkbox"
                />
                <span>Low</span>
              </label>
            </p>

            <h2 className="admin-section-title">Account events</h2>
            <p>
              <label className="admin-check">
                <input
                  checked={config.notifyRegistrations}
                  onChange={(event) => update({ notifyRegistrations: event.target.checked })}
                  type="checkbox"
                />
                <span>New registrations</span>
              </label>{" "}
              <label className="admin-check">
                <input
                  checked={config.notifyApprovals}
                  onChange={(event) => update({ notifyApprovals: event.target.checked })}
                  type="checkbox"
                />
                <span>Account approvals</span>
              </label>
            </p>

            <div className="admin-toolbar">
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
              {saveFeedback !== null ? <FeedbackText feedback={saveFeedback} /> : null}
              {testFeedback !== null ? <FeedbackText feedback={testFeedback} /> : null}
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
