import { err, ok, type Result } from "@/lib/domain/result";

export const WURMMAPS_EVENT_FEED_LIMIT = 30;

const WURMMAPS_STAT_DELEGATE_BASE_URL = "https://wurmmaps.xyz/APIs/stat-delegate.php";
const EVENT_SECTIONS: Array<{
  kind: WurmMapsEventKind;
  label: string;
  source: string;
}> = [
  { kind: "deed", label: "Deed", source: "Deed Events" },
  { kind: "mission", label: "Mission", source: "Mission Events" },
  { kind: "missionConstruction", label: "Mission Build", source: "Mission Constructions" },
  { kind: "holySite", label: "Holy Site", source: "Holy Sites" },
  { kind: "uniqueSlaying", label: "Unique", source: "Unique Slayings" },
  { kind: "rift", label: "Rift", source: "Rifts" },
  { kind: "rite", label: "Rite", source: "Rite Spell Casts" },
  { kind: "lightningStrike", label: "Lightning", source: "Lightning Strikes" }
];

export type WurmMapsEventKind =
  | "deed"
  | "holySite"
  | "lightningStrike"
  | "mission"
  | "missionConstruction"
  | "rift"
  | "rite"
  | "uniqueSlaying";

export type WurmMapsEvent = {
  id: string;
  kind: WurmMapsEventKind;
  label: string;
  message: string;
  subtype: number | null;
  timestamp: number;
};

export type WurmMapsServerStatus = {
  status: "offline" | "online" | "unknown";
  uptimeSeconds: number | null;
  weather: string | null;
  wurmTime: string | null;
};

export type WurmMapsEventFeed = {
  events: WurmMapsEvent[];
  fetchedAt: string;
  serverStatus: WurmMapsServerStatus;
  sourceUrl: string;
};

type NormalizeOptions = {
  fetchedAt: Date;
  serverSlug?: string;
  sourceUrl: string;
};

type FetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export async function fetchWurmMapsEventFeed(
  serverName: string,
  options: FetchOptions = {}
): Promise<Result<WurmMapsEventFeed>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const serverSlug = getWurmMapsServerSlug(serverName);
  const sourceUrl = `${WURMMAPS_STAT_DELEGATE_BASE_URL}?map=${encodeURIComponent(serverSlug)}`;

  try {
    const response = await fetchImpl(sourceUrl, {
      cache: "no-store",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return err("WurmMaps event feed is unavailable");
    }

    const body = await response.json().catch(() => null) as unknown;
    return normalizeWurmMapsEventFeed(body, {
      fetchedAt: now(),
      serverSlug,
      sourceUrl
    });
  } catch {
    return err("WurmMaps event feed is unavailable");
  }
}

export function normalizeWurmMapsEventFeed(
  input: unknown,
  options: NormalizeOptions
): Result<WurmMapsEventFeed> {
  if (!isRecord(input)) {
    return err("WurmMaps event feed is invalid");
  }

  const events = EVENT_SECTIONS.flatMap((section) => parseEventSection(input[section.source], section))
    .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id))
    .slice(0, WURMMAPS_EVENT_FEED_LIMIT);

  return ok({
    events,
    fetchedAt: options.fetchedAt.toISOString(),
    serverStatus: parseServerStatus(input, options.serverSlug),
    sourceUrl: options.sourceUrl
  });
}

function getWurmMapsServerSlug(serverName: string): string {
  return serverName.trim().toLowerCase();
}

function parseEventSection(
  value: unknown,
  section: { kind: WurmMapsEventKind; label: string }
): WurmMapsEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: WurmMapsEvent[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];

    if (!isRecord(item)) {
      continue;
    }

    const timestamp = parseInteger(item.timestamp);
    const message = readString(item.message);

    if (timestamp === null || message === "") {
      continue;
    }

    events.push({
      id: readString(item.id) || `${section.kind}-${timestamp}-${index}`,
      kind: section.kind,
      label: section.label,
      message: decodeHtmlEntities(message),
      subtype: parseInteger(item.subtype),
      timestamp
    });
  }

  return events;
}

function parseServerStatus(input: Record<string, unknown>, serverSlug?: string): WurmMapsServerStatus {
  const generalServerInfo = Array.isArray(input["General Server Info"]) ? input["General Server Info"] : [];
  const globalServerInfo = Array.isArray(input["Global Server Info"]) ? input["Global Server Info"] : [];
  const matchingServer = findMatchingServerInfo(generalServerInfo, serverSlug);
  const globalInfo = globalServerInfo.find(isRecord);

  return {
    status: getStatus(readString(matchingServer?.status)),
    uptimeSeconds: parseInteger(matchingServer?.uptime),
    weather: readNullableString(globalInfo?.wind),
    wurmTime: readNullableString(globalInfo?.wurmtime)
  };
}

function findMatchingServerInfo(items: unknown[], serverSlug?: string): Record<string, unknown> | null {
  const records = items.filter(isRecord);

  if (records.length === 0) {
    return null;
  }

  if (serverSlug === undefined) {
    return records.find((record) => readString(record.servername) === "celebration") ?? records[0] ?? null;
  }

  return records.find((record) => readString(record.servername).toLowerCase() === serverSlug) ?? records[0] ?? null;
}

function getStatus(status: string): WurmMapsServerStatus["status"] {
  if (status === "1") {
    return "online";
  }

  if (status === "0") {
    return "offline";
  }

  return "unknown";
}

function parseInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text === "" ? null : decodeHtmlEntities(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)))
    .replace(/&#(\d+);/g, (_, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
