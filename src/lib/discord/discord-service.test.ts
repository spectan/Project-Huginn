import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertWithActor } from "@/lib/alerts/alert-types";
import {
  buildAccountEventEmbed,
  buildAlertEmbed,
  DISCORD_NOT_CONFIGURED_ERROR,
  dispatchDiscordNotification,
  getDiscordConfig,
  saveDiscordConfig,
  sendTestNotification,
  type DiscordConfigData,
  type DiscordEmbed,
  type DiscordServiceDependencies
} from "./discord-service";

const WEBHOOK_URL = "https://discord.com/api/webhooks/1234/token";

function createConfig(overrides: Partial<DiscordConfigData> = {}): DiscordConfigData {
  return {
    webhookUrl: WEBHOOK_URL,
    enabled: true,
    alertSeverityHigh: true,
    alertSeverityMedium: false,
    alertSeverityLow: false,
    notifyRegistrations: false,
    notifyApprovals: false,
    ...overrides
  };
}

function createDependencies(initial: DiscordConfigData | null): DiscordServiceDependencies & {
  __test: {
    saved: DiscordConfigData[];
  };
} {
  let stored = initial;
  const saved: DiscordConfigData[] = [];

  return {
    findConfig: async () => stored,
    saveConfig: async (config) => {
      saved.push(config);
      stored = config;
      return config;
    },
    __test: {
      saved
    }
  };
}

function createAlert(overrides: Partial<AlertWithActor> = {}): AlertWithActor {
  return {
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    actorUserId: "user-1",
    actorUsername: "alice",
    createdAt: new Date("2026-05-10T12:00:00.000Z"),
    description: "20 markers deleted in the last 15 minutes",
    id: "alert-1",
    mapId: "map-1",
    mapName: "Celebration",
    metadata: { count: 20 },
    resolvedAt: null,
    resolvedByUserId: null,
    rule: "DELETE_SPIKE",
    severity: "HIGH",
    status: "OPEN",
    title: "High marker deletion rate for alice",
    updatedAt: new Date("2026-05-10T12:00:00.000Z"),
    ...overrides
  };
}

function fetchMock(response?: Partial<Response>) {
  return vi.fn(async () => ({
    ok: true,
    status: 204,
    ...response
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function postedEmbed(fetchSpy: ReturnType<typeof vi.fn>, callIndex = 0): DiscordEmbed {
  const call = fetchSpy.mock.calls[callIndex];
  const init = call?.[1] as { body: string };
  const payload = JSON.parse(init.body) as { embeds: DiscordEmbed[] };
  const embed = payload.embeds[0];

  if (embed === undefined) {
    throw new Error("No embed posted");
  }

  return embed;
}

describe("discord service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getDiscordConfig", () => {
    it("returns model defaults with an empty webhook URL when no row exists", async () => {
      const deps = createDependencies(null);

      const result = await getDiscordConfig(deps);

      expect(result).toEqual({
        ok: true,
        value: {
          webhookUrl: "",
          enabled: false,
          alertSeverityHigh: true,
          alertSeverityMedium: false,
          alertSeverityLow: false,
          notifyRegistrations: false,
          notifyApprovals: false
        }
      });
    });

    it("returns the stored config when a row exists", async () => {
      const stored = createConfig({ notifyApprovals: true });
      const deps = createDependencies(stored);

      const result = await getDiscordConfig(deps);

      expect(result).toEqual({ ok: true, value: stored });
    });
  });

  describe("saveDiscordConfig", () => {
    it("rejects non-object input", async () => {
      const deps = createDependencies(null);

      const result = await saveDiscordConfig("nope", deps);

      expect(result).toEqual({ ok: false, error: "Discord config is required" });
      expect(deps.__test.saved).toHaveLength(0);
    });

    it("rejects a non-Discord webhook URL", async () => {
      const deps = createDependencies(null);

      const result = await saveDiscordConfig({ webhookUrl: "https://example.com/hook" }, deps);

      expect(result).toEqual({ ok: false, error: "Webhook URL must be a Discord webhook URL" });
      expect(deps.__test.saved).toHaveLength(0);
    });

    it("accepts discord.com and discordapp.com webhook URLs", async () => {
      const deps = createDependencies(null);

      const discordCom = await saveDiscordConfig(
        { webhookUrl: "https://discord.com/api/webhooks/1/abc" },
        deps
      );
      const discordAppCom = await saveDiscordConfig(
        { webhookUrl: "https://discordapp.com/api/webhooks/2/def" },
        deps
      );

      expect(discordCom.ok).toBe(true);
      expect(discordAppCom.ok).toBe(true);
    });

    it("requires a webhook URL when enabled", async () => {
      const deps = createDependencies(null);

      const result = await saveDiscordConfig({ enabled: true, webhookUrl: "" }, deps);

      expect(result).toEqual({
        ok: false,
        error: "A webhook URL is required when Discord notifications are enabled"
      });
      expect(deps.__test.saved).toHaveLength(0);
    });

    it("allows an empty webhook URL while disabled", async () => {
      const deps = createDependencies(null);

      const result = await saveDiscordConfig({ enabled: false, webhookUrl: "" }, deps);

      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.value.webhookUrl).toBe("");
        expect(result.value.enabled).toBe(false);
      }
    });

    it("coerces booleans and persists the full config", async () => {
      const deps = createDependencies(null);

      const result = await saveDiscordConfig({
        webhookUrl: WEBHOOK_URL,
        enabled: 1,
        alertSeverityHigh: true,
        alertSeverityMedium: "yes",
        alertSeverityLow: 0,
        notifyRegistrations: true,
        notifyApprovals: undefined
      }, deps);

      expect(result).toEqual({
        ok: true,
        value: {
          webhookUrl: WEBHOOK_URL,
          enabled: true,
          alertSeverityHigh: true,
          alertSeverityMedium: true,
          alertSeverityLow: false,
          notifyRegistrations: true,
          notifyApprovals: false
        }
      });
      expect(deps.__test.saved).toHaveLength(1);
    });
  });

  describe("buildAlertEmbed", () => {
    it("uses red for HIGH, amber for MEDIUM and blue for LOW", () => {
      expect(buildAlertEmbed(createAlert({ severity: "HIGH" })).color).toBe(0xef4444);
      expect(buildAlertEmbed(createAlert({ severity: "MEDIUM" })).color).toBe(0xf59e0b);
      expect(buildAlertEmbed(createAlert({ severity: "LOW" })).color).toBe(0x3b82f6);
    });

    it("includes rule, severity, actor and map fields", () => {
      const embed = buildAlertEmbed(createAlert());

      expect(embed.title).toBe("High marker deletion rate for alice");
      expect(embed.description).toBe("20 markers deleted in the last 15 minutes");
      expect(embed.timestamp).toBe("2026-05-10T12:00:00.000Z");
      expect(embed.fields).toEqual([
        { name: "Rule", value: "DELETE_SPIKE", inline: true },
        { name: "Severity", value: "HIGH", inline: true },
        { name: "Actor", value: "alice", inline: true },
        { name: "Map", value: "Celebration", inline: true }
      ]);
    });

    it("omits actor and map fields when absent", () => {
      const embed = buildAlertEmbed(createAlert({ actorUsername: null, mapName: null }));

      expect(embed.fields).toEqual([
        { name: "Rule", value: "DELETE_SPIKE", inline: true },
        { name: "Severity", value: "HIGH", inline: true }
      ]);
    });
  });

  describe("buildAccountEventEmbed", () => {
    it("builds a green registration embed", () => {
      const embed = buildAccountEventEmbed("registration", { username: "bob" });

      expect(embed.title).toBe("New account registered");
      expect(embed.color).toBe(0x22c55e);
      expect(embed.fields).toEqual([
        { name: "Username", value: "bob", inline: true }
      ]);
    });

    it("builds an approval embed with the approving admin", () => {
      const embed = buildAccountEventEmbed("approval", {
        username: "bob",
        actorUsername: "root"
      });

      expect(embed.title).toBe("Account approved");
      expect(embed.color).toBe(0x22c55e);
      expect(embed.fields).toEqual([
        { name: "Username", value: "bob", inline: true },
        { name: "Approved by", value: "root", inline: true }
      ]);
    });
  });

  describe("dispatchDiscordNotification", () => {
    it("posts an alert embed when the severity toggle is on", async () => {
      const fetchSpy = fetchMock();
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(createConfig());
      const alert = createAlert({ severity: "HIGH" });

      const result = await dispatchDiscordNotification({ kind: "alert", alert }, deps);

      expect(result).toEqual({ ok: true, value: null });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(WEBHOOK_URL);
      expect(init.method).toBe("POST");
      expect(init.signal).toBeInstanceOf(AbortSignal);

      const embed = postedEmbed(fetchSpy);
      expect(embed.title).toBe(alert.title);
      expect(embed.color).toBe(0xef4444);
    });

    it("does nothing when disabled", async () => {
      const fetchSpy = fetchMock();
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(createConfig({ enabled: false }));

      const result = await dispatchDiscordNotification(
        { kind: "alert", alert: createAlert({ severity: "HIGH" }) },
        deps
      );

      expect(result).toEqual({ ok: true, value: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does nothing when no webhook URL is configured", async () => {
      const fetchSpy = fetchMock();
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(createConfig({ webhookUrl: "" }));

      const result = await dispatchDiscordNotification(
        { kind: "alert", alert: createAlert({ severity: "HIGH" }) },
        deps
      );

      expect(result).toEqual({ ok: true, value: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does nothing when no config row exists", async () => {
      const fetchSpy = fetchMock();
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(null);

      const result = await dispatchDiscordNotification(
        { kind: "alert", alert: createAlert({ severity: "HIGH" }) },
        deps
      );

      expect(result).toEqual({ ok: true, value: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
      ["HIGH", "alertSeverityHigh"],
      ["MEDIUM", "alertSeverityMedium"],
      ["LOW", "alertSeverityLow"]
    ] as const)("gates %s alerts on the %s toggle", async (severity, toggle) => {
      const alert = createAlert({ severity });

      const offFetch = fetchMock();
      vi.stubGlobal("fetch", offFetch);
      const offDeps = createDependencies(createConfig({ [toggle]: false }));
      await dispatchDiscordNotification({ kind: "alert", alert }, offDeps);
      expect(offFetch).not.toHaveBeenCalled();

      const onFetch = fetchMock();
      vi.stubGlobal("fetch", onFetch);
      const onDeps = createDependencies(createConfig({ [toggle]: true }));
      await dispatchDiscordNotification({ kind: "alert", alert }, onDeps);
      expect(onFetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["registration", "notifyRegistrations"],
      ["approval", "notifyApprovals"]
    ] as const)("gates %s notifications on the %s toggle", async (kind, toggle) => {
      const offFetch = fetchMock();
      vi.stubGlobal("fetch", offFetch);
      const offDeps = createDependencies(createConfig({ [toggle]: false }));
      await dispatchDiscordNotification({ kind, username: "bob" }, offDeps);
      expect(offFetch).not.toHaveBeenCalled();

      const onFetch = fetchMock();
      vi.stubGlobal("fetch", onFetch);
      const onDeps = createDependencies(createConfig({ [toggle]: true }));
      await dispatchDiscordNotification({ kind, username: "bob" }, onDeps);
      expect(onFetch).toHaveBeenCalledTimes(1);

      const embed = postedEmbed(onFetch);
      expect(embed.color).toBe(0x22c55e);
    });

    it("tolerates fetch failures", async () => {
      const fetchSpy = vi.fn(async () => {
        throw new Error("network down");
      });
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(createConfig());

      const result = await dispatchDiscordNotification(
        { kind: "alert", alert: createAlert({ severity: "HIGH" }) },
        deps
      );

      expect(result).toEqual({ ok: true, value: null });
    });
  });

  describe("sendTestNotification", () => {
    it("errors when the webhook is not configured", async () => {
      const deps = createDependencies(null);

      const result = await sendTestNotification({ username: "root" }, deps);

      expect(result).toEqual({ ok: false, error: DISCORD_NOT_CONFIGURED_ERROR });
    });

    it("errors when the webhook is disabled", async () => {
      const deps = createDependencies(createConfig({ enabled: false }));

      const result = await sendTestNotification({ username: "root" }, deps);

      expect(result).toEqual({ ok: false, error: DISCORD_NOT_CONFIGURED_ERROR });
    });

    it("posts a neutral test embed naming the admin", async () => {
      const fetchSpy = fetchMock();
      vi.stubGlobal("fetch", fetchSpy);
      const deps = createDependencies(createConfig());

      const result = await sendTestNotification({ username: "root" }, deps);

      expect(result).toEqual({ ok: true, value: null });

      const embed = postedEmbed(fetchSpy);
      expect(embed.title).toBe("Test message from Huginn");
      expect(embed.color).toBe(0x9ca3af);
      expect(embed.fields).toEqual([
        { name: "Sent by", value: "root", inline: true }
      ]);
    });

    it("returns the Discord status when the webhook responds with an error", async () => {
      vi.stubGlobal("fetch", fetchMock({ ok: false, status: 500 }));
      const deps = createDependencies(createConfig());

      const result = await sendTestNotification({ username: "root" }, deps);

      expect(result).toEqual({ ok: false, error: "Discord webhook request failed with status 500" });
    });

    it("tolerates network failures with a generic error", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("network down");
      }));
      const deps = createDependencies(createConfig());

      const result = await sendTestNotification({ username: "root" }, deps);

      expect(result).toEqual({ ok: false, error: "Discord webhook request failed" });
    });
  });
});
