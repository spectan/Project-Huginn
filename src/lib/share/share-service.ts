import { canReadMap, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import { parseUserMapSettings, type UserMapSettings } from "@/lib/map-settings/map-settings";
import {
  getUserMapSettings,
  type UserMapSettingsDependencies
} from "@/lib/map-settings/map-settings-service";
import { generateShareToken, hashShareToken } from "./share-tokens";

export const MIN_SHARE_LINK_HOURS = 1;
export const MAX_SHARE_LINK_HOURS = 24;
export const SHARE_LINK_INVALID_MESSAGE = "Share link is invalid or has expired";
export const SHARE_LINK_HOURS_INVALID_MESSAGE =
  "expiresInHours must be a whole number of hours between 1 and 24";

type Actor = UserAccess & {
  id: string;
};

export type ShareLinkCreatorRecord = {
  id: string;
  watermarkNumber: number | null;
};

export type ShareLinkRecord = {
  createdBy: ShareLinkCreatorRecord;
  expiresAt: Date;
  layerId: string | null;
  mapId: string;
  settings: unknown;
};

export type ResolvedShareLink = {
  createdBy: ShareLinkCreatorRecord;
  expiresAt: Date;
  layerId: string | null;
  mapId: string;
  settings: UserMapSettings;
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
  findShareLinkWithCreator(tokenHash: string): Promise<ShareLinkRecord | null>;
  settings: UserMapSettingsDependencies;
};

export async function createShareLink(
  input: { actor: Actor; expiresInHours: unknown; layerId?: unknown; mapId: string },
  dependencies: ShareDependencies
): Promise<Result<{ expiresAt: Date; token: string }>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const expiresInHours = parseExpiresInHours(input.expiresInHours);

  if (expiresInHours === null) {
    return err(SHARE_LINK_HOURS_INVALID_MESSAGE);
  }

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
    layerId: parseLayerId(input.layerId),
    mapId: input.mapId,
    settings: sanitizeSettingsForShare(settingsResult.value),
    tokenHash: hashShareToken(token)
  });

  return ok({ expiresAt, token });
}

export async function resolveShareLink(
  token: string,
  dependencies: ShareDependencies
): Promise<Result<{ link: ResolvedShareLink }>> {
  const record = await dependencies.findShareLinkWithCreator(hashShareToken(token));

  if (record === null || record.expiresAt <= new Date()) {
    return err(SHARE_LINK_INVALID_MESSAGE);
  }

  return ok({
    link: {
      createdBy: record.createdBy,
      expiresAt: record.expiresAt,
      layerId: record.layerId,
      mapId: record.mapId,
      settings: parseUserMapSettings(record.settings)
    }
  });
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

function parseLayerId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const layerId = input.trim();

  return layerId.length > 0 ? layerId : null;
}
