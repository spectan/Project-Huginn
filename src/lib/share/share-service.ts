import { createDiscordDependencies } from "@/lib/discord/database";
import {
  dispatchDiscordNotification,
  type DiscordNotificationMessage
} from "@/lib/discord/discord-service";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { canReadMap, type MapPermission, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import { parseUserMapSettings, type UserMapSettings } from "@/lib/map-settings/map-settings";
import {
  getUserMapSettings,
  type UserMapSettingsDependencies
} from "@/lib/map-settings/map-settings-service";
import { generateShareToken, hashShareToken } from "./share-tokens";

const MIN_SHARE_LINK_HOURS = 1;
const MAX_SHARE_LINK_HOURS = 24;
const MAX_LAYER_ID_LENGTH = 128;
export const SHARE_LINK_LAYER_INVALID_MESSAGE = "Layer was not found";
export const SHARE_LINK_INVALID_MESSAGE = "Share link is invalid or has expired";
export const SHARE_LINK_HOURS_INVALID_MESSAGE =
  "expiresInHours must be a whole number of hours between 1 and 24";

type Actor = UserAccess & {
  id: string;
  username: string;
};

type ShareLinkCreator = {
  id: string;
  watermarkNumber: number | null;
};

export type ShareLinkCreatorRecord = ShareLinkCreator & UserAccess & {
  mapPermissions: readonly MapPermission[];
};

export type ShareLinkRecord = {
  createdBy: ShareLinkCreatorRecord;
  expiresAt: Date;
  layerId: string | null;
  mapId: string;
  settings: unknown;
};

type ResolvedShareLink = {
  createdBy: ShareLinkCreator;
  expiresAt: Date;
  layerId: string | null;
  mapId: string;
  settings: UserMapSettings;
};

export type ShareLinkAuditInput = {
  action: "SHARE_LINK_CREATED";
  actorUserId: string;
  mapId: string;
  metadata: Record<string, unknown>;
  targetId: string;
  targetType: "MAP";
};

export type ShareLinkAlertInput = {
  actorUserId: string;
  description: string;
  mapId: string;
  metadata: Record<string, unknown>;
  rule: "SHARE_LINK_CREATED";
  severity: "LOW";
  title: string;
};

export type ShareDependencies = {
  createShareLink(input: {
    createdByUserId: string;
    expiresAt: Date;
    layerId: string | null;
    mapId: string;
    settings: UserMapSettings;
    tokenHash: string;
  }): Promise<void>;
  createShareLinkAlert(input: ShareLinkAlertInput): Promise<void>;
  deleteShareLink(tokenHash: string): Promise<void>;
  findMapName(mapId: string): Promise<string | null>;
  findShareLinkWithCreator(tokenHash: string): Promise<ShareLinkRecord | null>;
  layerBelongsToMap(input: { layerId: string; mapId: string }): Promise<boolean>;
  recordAudit(input: ShareLinkAuditInput): Promise<void>;
  settings: UserMapSettingsDependencies;
};

export async function createShareLink(
  input: {
    actor: Actor;
    expiresInHours: unknown;
    layerId?: unknown;
    mapId: string;
  },
  dependencies: ShareDependencies
): Promise<Result<{ expiresAt: Date; token: string }>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const expiresInHours = parseExpiresInHours(input.expiresInHours);

  if (expiresInHours === null) {
    return err(SHARE_LINK_HOURS_INVALID_MESSAGE);
  }

  const layerIdResult = await parseLayerId(input.layerId, input.mapId, dependencies);

  if (!layerIdResult.ok) {
    return layerIdResult;
  }

  const layerId = layerIdResult.value;
  const settingsResult = await getUserMapSettings(
    { actor: input.actor, mapId: input.mapId },
    dependencies.settings
  );

  if (!settingsResult.ok) {
    return settingsResult;
  }

  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  await dependencies.createShareLink({
    createdByUserId: input.actor.id,
    expiresAt,
    layerId,
    mapId: input.mapId,
    settings: sanitizeSettingsForShare(settingsResult.value),
    tokenHash: hashShareToken(token)
  });

  const mapName = await resolveMapName(input.mapId, dependencies);

  await recordShareLinkCreation(
    input.actor,
    {
      expiresInHours,
      layerId,
      mapId: input.mapId,
      mapName
    },
    dependencies
  );

  dispatchDiscordSafely({
    kind: "share",
    username: input.actor.username,
    mapName,
    expiresInHours
  });

  return ok({ expiresAt, token });
}

export async function resolveShareLink(
  token: string,
  dependencies: ShareDependencies
): Promise<Result<{ link: ResolvedShareLink }>> {
  const tokenHash = hashShareToken(token);
  const record = await dependencies.findShareLinkWithCreator(tokenHash);

  if (record === null) {
    return err(SHARE_LINK_INVALID_MESSAGE);
  }

  // A link must stop working once its creator could no longer read the map
  // themselves (suspended, demoted, or permission removed).
  if (record.expiresAt <= new Date() || !canReadMap(record.createdBy, record.mapId)) {
    await dependencies.deleteShareLink(tokenHash);
    return err(SHARE_LINK_INVALID_MESSAGE);
  }

  return ok({
    link: {
      createdBy: {
        id: record.createdBy.id,
        watermarkNumber: record.createdBy.watermarkNumber
      },
      expiresAt: record.expiresAt,
      layerId: record.layerId,
      mapId: record.mapId,
      settings: parseUserMapSettings(record.settings)
    }
  });
}

// The link is already persisted at this point, so audit/alert failures are
// swallowed: failing the request would orphan a working link the user never sees.
async function recordShareLinkCreation(
  actor: Actor,
  details: {
    expiresInHours: number;
    layerId: string | null;
    mapId: string;
    mapName: string;
  },
  dependencies: ShareDependencies
): Promise<void> {
  const metadata = {
    expiresInHours: details.expiresInHours,
    layerId: details.layerId
  };
  assertNoCoordinateMetadata(metadata);

  try {
    await dependencies.recordAudit({
      action: "SHARE_LINK_CREATED",
      actorUserId: actor.id,
      mapId: details.mapId,
      metadata,
      targetId: details.mapId,
      targetType: "MAP"
    });
  } catch {
    // Audit failures must not break share link creation.
  }

  try {
    await dependencies.createShareLinkAlert({
      actorUserId: actor.id,
      description: `${actor.username} created a read-only share link for ${details.mapName} that expires in ${details.expiresInHours} hours`,
      mapId: details.mapId,
      metadata: {
        expiresInHours: details.expiresInHours
      },
      rule: "SHARE_LINK_CREATED",
      severity: "LOW",
      title: `Share link created by ${actor.username}`
    });
  } catch {
    // Alert failures must not break share link creation.
  }
}

async function resolveMapName(mapId: string, dependencies: ShareDependencies): Promise<string> {
  try {
    return (await dependencies.findMapName(mapId)) ?? mapId;
  } catch {
    // Fall back to the map id when the lookup fails.
    return mapId;
  }
}

function dispatchDiscordSafely(message: DiscordNotificationMessage): void {
  try {
    dispatchDiscordNotification(message, createDiscordDependencies()).catch(() => undefined);
  } catch {
    // Discord notifications are fire-and-forget; failures must not block share link creation.
  }
}

function sanitizeSettingsForShare(settings: UserMapSettings): UserMapSettings {
  return {
    ...settings,
    annotations: [],
    favoriteServerId: null,
    roadwayEditPanelPosition: null,
    tileHighlightPanelPosition: null
  };
}

function parseExpiresInHours(input: unknown): number | null {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < MIN_SHARE_LINK_HOURS ||
    input > MAX_SHARE_LINK_HOURS
  ) {
    return null;
  }

  return input;
}

async function parseLayerId(
  input: unknown,
  mapId: string,
  dependencies: ShareDependencies
): Promise<Result<string | null>> {
  if (input === undefined || input === null) {
    return ok(null);
  }

  if (typeof input !== "string") {
    return err(SHARE_LINK_LAYER_INVALID_MESSAGE);
  }

  const layerId = input.trim();

  if (layerId.length === 0) {
    return ok(null);
  }

  if (layerId.length > MAX_LAYER_ID_LENGTH) {
    return err(SHARE_LINK_LAYER_INVALID_MESSAGE);
  }

  // Maps without stored layers expose a synthetic default layer id.
  if (layerId === `${mapId}:default`) {
    return ok(layerId);
  }

  return (await dependencies.layerBelongsToMap({ layerId, mapId }))
    ? ok(layerId)
    : err(SHARE_LINK_LAYER_INVALID_MESSAGE);
}
