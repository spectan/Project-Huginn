import type { AlertSeverity, AlertWithActor } from "@/lib/alerts/alert-types";
import { err, ok, type Result } from "@/lib/domain/result";

export type DiscordConfigData = {
  webhookUrl: string;
  enabled: boolean;
  alertSeverityHigh: boolean;
  alertSeverityMedium: boolean;
  alertSeverityLow: boolean;
  notifyRegistrations: boolean;
  notifyApprovals: boolean;
};

export type DiscordNotificationMessage =
  | { kind: "alert"; alert: AlertWithActor }
  | { kind: "registration" | "approval"; username: string; actorUsername?: string };

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline: boolean;
};

export type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  fields: DiscordEmbedField[];
  timestamp: string;
};

export type DiscordServiceDependencies = {
  findConfig(): Promise<DiscordConfigData | null>;
  saveConfig(config: DiscordConfigData): Promise<DiscordConfigData>;
};

export const DISCORD_NOT_CONFIGURED_ERROR = "Discord webhook is not configured or enabled";

const WEBHOOK_TIMEOUT_MS = 5000;

const DEFAULT_DISCORD_CONFIG: DiscordConfigData = {
  webhookUrl: "",
  enabled: false,
  alertSeverityHigh: true,
  alertSeverityMedium: false,
  alertSeverityLow: false,
  notifyRegistrations: false,
  notifyApprovals: false
};

const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  HIGH: 0xef4444,
  MEDIUM: 0xf59e0b,
  LOW: 0x3b82f6
};

const ACCOUNT_EVENT_COLOR = 0x22c55e;
const TEST_MESSAGE_COLOR = 0x9ca3af;

export async function getDiscordConfig(
  dependencies: DiscordServiceDependencies
): Promise<Result<DiscordConfigData>> {
  return ok(await loadConfig(dependencies));
}

export async function saveDiscordConfig(
  input: unknown,
  dependencies: DiscordServiceDependencies
): Promise<Result<DiscordConfigData>> {
  if (typeof input !== "object" || input === null) {
    return err("Discord config is required");
  }

  const webhookUrl = getString(input, "webhookUrl").trim();

  if (webhookUrl.length > 0 && !isDiscordWebhookUrl(webhookUrl)) {
    return err("Webhook URL must be a Discord webhook URL");
  }

  const enabled = getBoolean(input, "enabled");

  if (enabled && webhookUrl.length === 0) {
    return err("A webhook URL is required when Discord notifications are enabled");
  }

  const saved = await dependencies.saveConfig({
    webhookUrl,
    enabled,
    alertSeverityHigh: getBoolean(input, "alertSeverityHigh"),
    alertSeverityMedium: getBoolean(input, "alertSeverityMedium"),
    alertSeverityLow: getBoolean(input, "alertSeverityLow"),
    notifyRegistrations: getBoolean(input, "notifyRegistrations"),
    notifyApprovals: getBoolean(input, "notifyApprovals")
  });

  return ok(saved);
}

export async function dispatchDiscordNotification(
  message: DiscordNotificationMessage,
  dependencies: DiscordServiceDependencies
): Promise<Result<null>> {
  const config = await loadConfig(dependencies);

  if (!shouldDispatch(config, message)) {
    return ok(null);
  }

  const embed = message.kind === "alert"
    ? buildAlertEmbed(message.alert)
    : buildAccountEventEmbed(message.kind, message);

  try {
    await postEmbed(config.webhookUrl, embed);
  } catch {
    // Discord notifications are best-effort; failures must not break callers.
  }

  return ok(null);
}

export async function sendTestNotification(
  input: { username: string },
  dependencies: DiscordServiceDependencies
): Promise<Result<null>> {
  const config = await loadConfig(dependencies);

  if (!config.enabled || config.webhookUrl.length === 0) {
    return err(DISCORD_NOT_CONFIGURED_ERROR);
  }

  try {
    const response = await postEmbed(config.webhookUrl, {
      title: "Test message from Huginn",
      description: "Discord notifications are configured correctly.",
      color: TEST_MESSAGE_COLOR,
      fields: [
        { name: "Sent by", value: input.username, inline: true }
      ],
      timestamp: new Date().toISOString()
    });

    if (!response.ok) {
      return err(`Discord webhook request failed with status ${response.status}`);
    }
  } catch {
    return err("Discord webhook request failed");
  }

  return ok(null);
}

export function buildAlertEmbed(alert: AlertWithActor): DiscordEmbed {
  const fields: DiscordEmbedField[] = [
    { name: "Rule", value: alert.rule, inline: true },
    { name: "Severity", value: alert.severity, inline: true }
  ];

  if (alert.actorUsername !== null) {
    fields.push({ name: "Actor", value: alert.actorUsername, inline: true });
  }

  if (alert.mapName !== null) {
    fields.push({ name: "Map", value: alert.mapName, inline: true });
  }

  return {
    title: alert.title,
    description: alert.description,
    color: SEVERITY_COLORS[alert.severity],
    fields,
    timestamp: alert.createdAt.toISOString()
  };
}

export function buildAccountEventEmbed(
  kind: "registration" | "approval",
  input: { username: string; actorUsername?: string }
): DiscordEmbed {
  const fields: DiscordEmbedField[] = [
    { name: "Username", value: input.username, inline: true }
  ];

  if (kind === "approval") {
    fields.push({ name: "Approved by", value: input.actorUsername ?? "unknown", inline: true });
  }

  return {
    title: kind === "registration" ? "New account registered" : "Account approved",
    description: kind === "registration"
      ? `${input.username} registered a new account.`
      : `${input.username} was approved and can now sign in.`,
    color: ACCOUNT_EVENT_COLOR,
    fields,
    timestamp: new Date().toISOString()
  };
}

async function loadConfig(
  dependencies: DiscordServiceDependencies
): Promise<DiscordConfigData> {
  const config = await dependencies.findConfig();
  return config ?? { ...DEFAULT_DISCORD_CONFIG };
}

function shouldDispatch(
  config: DiscordConfigData,
  message: DiscordNotificationMessage
): boolean {
  if (!config.enabled || config.webhookUrl.length === 0) {
    return false;
  }

  if (message.kind === "alert") {
    switch (message.alert.severity) {
      case "HIGH":
        return config.alertSeverityHigh;
      case "MEDIUM":
        return config.alertSeverityMedium;
      case "LOW":
        return config.alertSeverityLow;
    }
  }

  return message.kind === "registration"
    ? config.notifyRegistrations
    : config.notifyApprovals;
}

async function postEmbed(webhookUrl: string, embed: DiscordEmbed): Promise<Response> {
  return fetch(webhookUrl, {
    body: JSON.stringify({ embeds: [embed] }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
  });
}

function isDiscordWebhookUrl(url: string): boolean {
  return url.startsWith("https://discord.com/api/webhooks/") ||
    url.startsWith("https://discordapp.com/api/webhooks/");
}

function getString(input: object, key: string): string {
  if (!(key in input)) {
    return "";
  }

  const value = input[key as keyof typeof input];
  return typeof value === "string" ? value : "";
}

function getBoolean(input: object, key: string): boolean {
  if (!(key in input)) {
    return false;
  }

  return Boolean(input[key as keyof typeof input]);
}
