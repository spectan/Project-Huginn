import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordView } from "./discord-view";

const baseConfig = {
  webhookUrl: "https://discord.com/api/webhooks/123/abc",
  enabled: true,
  alertSeverityHigh: true,
  alertSeverityMedium: false,
  alertSeverityLow: true,
  notifyRegistrations: false,
  notifyApprovals: true,
  notifyMarkerCreated: true,
  notifyMarkerUpdated: false,
  notifyMarkerDeleted: true,
  notifyShareLinks: false
};

type StubResult = { ok: boolean; status: number; body: unknown };

function jsonResponse(result: StubResult) {
  return { ok: result.ok, status: result.status, json: async () => result.body };
}

function stubFetch(overrides?: { onPut?: () => StubResult; onTest?: () => StubResult }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PUT") {
      const result = overrides?.onPut?.() ?? {
        ok: true,
        status: 200,
        body: { config: JSON.parse(String(init.body)) }
      };
      return jsonResponse(result);
    }
    if (url.endsWith("/api/admin/discord/test")) {
      const result = overrides?.onTest?.() ?? { ok: true, status: 200, body: { ok: true } };
      return jsonResponse(result);
    }
    return jsonResponse({ ok: true, status: 200, body: { config: baseConfig } });
  }) as unknown as ReturnType<typeof vi.fn>;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function putBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const call = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "PUT"
  );
  expect(call).toBeTruthy();
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

describe("DiscordView", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the config and renders all fields into the form", async () => {
    const fetchMock = stubFetch();

    render(React.createElement(DiscordView));

    expect(await screen.findByLabelText(/Webhook URL/)).toHaveProperty("value", baseConfig.webhookUrl);
    expect(screen.getByLabelText("Enabled")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("High")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Medium")).toHaveProperty("checked", false);
    expect(screen.getByLabelText("Low")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("New registrations")).toHaveProperty("checked", false);
    expect(screen.getByLabelText("Account approvals")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Created")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Updated")).toHaveProperty("checked", false);
    expect(screen.getByLabelText("Deleted")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Share link created")).toHaveProperty("checked", false);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/discord");
  });

  it("saves the full form state via PUT and shows Saved", async () => {
    const fetchMock = stubFetch();

    render(React.createElement(DiscordView));
    expect(await screen.findByLabelText(/Webhook URL/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Webhook URL/), {
      target: { value: "https://discord.com/api/webhooks/999/xyz" }
    });
    fireEvent.click(screen.getByLabelText("Medium"));
    fireEvent.click(screen.getByLabelText("Deleted"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(putBody(fetchMock)).toEqual({
        ...baseConfig,
        webhookUrl: "https://discord.com/api/webhooks/999/xyz",
        alertSeverityMedium: true,
        notifyMarkerDeleted: false
      });
    });
    expect(await screen.findByText("Saved ✓")).toBeTruthy();
  });

  it("shows the API error when saving fails validation", async () => {
    stubFetch({
      onPut: () => ({ ok: false, status: 400, body: { error: "Webhook URL must be a Discord webhook URL" } })
    });

    render(React.createElement(DiscordView));
    expect(await screen.findByLabelText(/Webhook URL/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Webhook URL must be a Discord webhook URL")).toBeTruthy();
  });

  it("sends a test message and shows the result", async () => {
    const fetchMock = stubFetch();

    render(React.createElement(DiscordView));
    expect(await screen.findByLabelText(/Webhook URL/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/discord/test", { method: "POST" })
    );
    expect(await screen.findByText("Test message sent")).toBeTruthy();
  });

  it("surfaces the error when Discord rejects the test message", async () => {
    stubFetch({
      onTest: () => ({ ok: false, status: 502, body: { error: "Discord rejected the webhook" } })
    });

    render(React.createElement(DiscordView));
    expect(await screen.findByLabelText(/Webhook URL/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));

    expect(await screen.findByText("Discord rejected the webhook")).toBeTruthy();
  });
});
