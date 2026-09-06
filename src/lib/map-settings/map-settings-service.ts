import { canReadMap, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import {
  mergeUserMapSettingsInput,
  parseUserMapSettings,
  type UserMapSettings
} from "./map-settings";

type Actor = UserAccess & {
  id: string;
};

type MapRecord = {
  id: string;
};

type UserMapSettingsRecord = {
  settings: unknown;
};

type SettingsProfileRecord = {
  name: string;
  settings: unknown;
  slot: number;
  updatedAt: Date;
};

export type SettingsProfileSummary = {
  name: string;
  slot: number;
  updatedAt: Date;
};

export type SettingsProfile = {
  name: string;
  settings: UserMapSettings;
  slot: number;
};

export type UserMapSettingsDependencies = {
  findMap(mapId: string): Promise<MapRecord | null>;
  findSettings(userId: string, mapId: string): Promise<UserMapSettingsRecord | null>;
  upsertSettings(input: {
    mapId: string;
    settings: UserMapSettings;
    userId: string;
  }): Promise<UserMapSettingsRecord>;
};

export type SettingsProfilesDependencies = UserMapSettingsDependencies & {
  findProfile(userId: string, mapId: string, slot: number): Promise<SettingsProfileRecord | null>;
  listProfiles(userId: string, mapId: string): Promise<SettingsProfileRecord[]>;
  renameProfile(input: {
    mapId: string;
    name: string;
    slot: number;
    userId: string;
  }): Promise<SettingsProfileRecord | null>;
  upsertProfile(input: {
    mapId: string;
    name: string;
    settings: UserMapSettings;
    slot: number;
    userId: string;
  }): Promise<SettingsProfileRecord>;
};

export const MIN_PROFILE_SLOT = 0;
export const MAX_PROFILE_SLOT = 2;
export const MAX_PROFILE_NAME_LENGTH = 40;

export async function getUserMapSettings(
  input: { actor: Actor; mapId: string },
  dependencies: UserMapSettingsDependencies
): Promise<Result<UserMapSettings>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const settings = await dependencies.findSettings(input.actor.id, map.id);
  return ok(parseUserMapSettings(settings?.settings ?? null));
}

export async function saveUserMapSettings(
  input: { actor: Actor; input: unknown; mapId: string },
  dependencies: UserMapSettingsDependencies
): Promise<Result<UserMapSettings>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const current = await dependencies.findSettings(input.actor.id, map.id);
  const mergedSettings = mergeUserMapSettingsInput(
    parseUserMapSettings(current?.settings ?? null),
    input.input
  );
  const saved = await dependencies.upsertSettings({
    mapId: map.id,
    settings: mergedSettings,
    userId: input.actor.id
  });

  return ok(parseUserMapSettings(saved.settings));
}

export async function listSettingsProfiles(
  input: { actor: Actor; mapId: string },
  dependencies: SettingsProfilesDependencies
): Promise<Result<SettingsProfileSummary[]>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const profiles = await dependencies.listProfiles(input.actor.id, map.id);
  return ok(profiles
    .map((profile) => ({
      name: profile.name,
      slot: profile.slot,
      updatedAt: profile.updatedAt
    }))
    .sort((left, right) => left.slot - right.slot));
}

export async function saveSettingsProfile(
  input: { actor: Actor; mapId: string; name?: unknown; slot: number },
  dependencies: SettingsProfilesDependencies
): Promise<Result<SettingsProfileSummary>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const slotResult = validateProfileSlot(input.slot);

  if (!slotResult.ok) {
    return slotResult;
  }

  const nameResult = normalizeProfileName(input.name, `Profile ${slotResult.value + 1}`);

  if (!nameResult.ok) {
    return nameResult;
  }

  const settings = await getUserMapSettings({ actor: input.actor, mapId: map.id }, dependencies);

  if (!settings.ok) {
    return err(settings.error);
  }

  const saved = await dependencies.upsertProfile({
    mapId: map.id,
    name: nameResult.value,
    settings: settings.value,
    slot: slotResult.value,
    userId: input.actor.id
  });

  return ok({
    name: saved.name,
    slot: saved.slot,
    updatedAt: saved.updatedAt
  });
}

export async function loadSettingsProfile(
  input: { actor: Actor; mapId: string; slot: number },
  dependencies: SettingsProfilesDependencies
): Promise<Result<SettingsProfile>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const slotResult = validateProfileSlot(input.slot);

  if (!slotResult.ok) {
    return slotResult;
  }

  const profile = await dependencies.findProfile(input.actor.id, map.id, slotResult.value);

  if (profile === null) {
    return err("Profile was not found");
  }

  return ok({
    name: profile.name,
    settings: parseUserMapSettings(profile.settings),
    slot: profile.slot
  });
}

export async function renameSettingsProfile(
  input: { actor: Actor; mapId: string; name: unknown; slot: number },
  dependencies: SettingsProfilesDependencies
): Promise<Result<SettingsProfileSummary>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const slotResult = validateProfileSlot(input.slot);

  if (!slotResult.ok) {
    return slotResult;
  }

  const nameResult = normalizeProfileName(input.name, null);

  if (!nameResult.ok) {
    return nameResult;
  }

  const renamed = await dependencies.renameProfile({
    mapId: map.id,
    name: nameResult.value,
    slot: slotResult.value,
    userId: input.actor.id
  });

  if (renamed === null) {
    return err("Profile was not found");
  }

  return ok({
    name: renamed.name,
    slot: renamed.slot,
    updatedAt: renamed.updatedAt
  });
}

function validateProfileSlot(slot: number): Result<number> {
  if (!Number.isInteger(slot) || slot < MIN_PROFILE_SLOT || slot > MAX_PROFILE_SLOT) {
    return err(`Slot must be an integer between ${MIN_PROFILE_SLOT} and ${MAX_PROFILE_SLOT}`);
  }

  return ok(slot);
}

function normalizeProfileName(input: unknown, fallback: string | null): Result<string> {
  const trimmed = typeof input === "string" ? input.trim() : "";

  if (trimmed.length === 0) {
    return fallback === null ? err("Profile name is required") : ok(fallback);
  }

  if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
    return err(`Profile name must be ${MAX_PROFILE_NAME_LENGTH} characters or fewer`);
  }

  return ok(trimmed);
}
