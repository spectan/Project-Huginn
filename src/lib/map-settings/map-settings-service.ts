import { canReadMap, type UserAccess } from "@/lib/domain/permissions";
import { err, ok, type Result } from "@/lib/domain/result";
import {
  checkUserMapSettingsCaps,
  mergeUserMapSettingsInput,
  parseUserMapSettings,
  pruneNoteCategoryStyles,
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

type SettingsProfileSummary = {
  name: string;
  slot: number;
  updatedAt: Date;
};

type SettingsProfile = {
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

type UserMapSettingsStore = Pick<UserMapSettingsDependencies, "findSettings" | "upsertSettings">;

/**
 * Saving merges into the stored settings, so the read-merge-write must be
 * serialized per (user, map): withSettingsLock runs `work` in a transaction
 * holding a lock on that pair, handing it a store bound to the transaction.
 */
export type SaveUserMapSettingsDependencies = UserMapSettingsDependencies & {
  /** Ids of the map's note categories (the keys of the per-category style maps). */
  findNoteCategoryIds(mapId: string): Promise<string[]>;
  withSettingsLock<T>(
    input: { mapId: string; userId: string },
    work: (store: UserMapSettingsStore) => Promise<T>
  ): Promise<T>;
};

// Profiles belong to the user, not a map, so the same slots follow them across servers.
export type SettingsProfilesDependencies = UserMapSettingsDependencies & {
  findProfile(userId: string, slot: number): Promise<SettingsProfileRecord | null>;
  listProfiles(userId: string): Promise<SettingsProfileRecord[]>;
  renameProfile(input: {
    name: string;
    slot: number;
    userId: string;
  }): Promise<SettingsProfileRecord | null>;
  upsertProfile(input: {
    name: string;
    settings: UserMapSettings;
    slot: number;
    userId: string;
  }): Promise<SettingsProfileRecord>;
};

const MIN_PROFILE_SLOT = 0;
const MAX_PROFILE_SLOT = 2;
const MAX_PROFILE_NAME_LENGTH = 40;

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
  dependencies: SaveUserMapSettingsDependencies
): Promise<Result<UserMapSettings>> {
  if (!canReadMap(input.actor, input.mapId)) {
    return err("Read access is required");
  }

  const map = await dependencies.findMap(input.mapId);

  if (map === null) {
    return err("Map was not found");
  }

  const categoryIds = new Set(await dependencies.findNoteCategoryIds(map.id));

  const saved = await dependencies.withSettingsLock(
    { mapId: map.id, userId: input.actor.id },
    async (store): Promise<Result<UserMapSettingsRecord>> => {
      const stored = await store.findSettings(input.actor.id, map.id);
      // Style entries for deleted note categories are dropped on every save.
      const current = pruneNoteCategoryStyles(
        parseUserMapSettings(stored?.settings ?? null),
        categoryIds
      );
      const mergedSettings = pruneNoteCategoryStyles(
        mergeUserMapSettingsInput(current, input.input),
        categoryIds
      );
      const capError = checkUserMapSettingsCaps(mergedSettings, current);

      if (capError !== null) {
        return err(capError);
      }

      return ok(await store.upsertSettings({
        mapId: map.id,
        settings: mergedSettings,
        userId: input.actor.id
      }));
    }
  );

  if (!saved.ok) {
    return saved;
  }

  return ok(parseUserMapSettings(saved.value.settings));
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

  const profiles = await dependencies.listProfiles(input.actor.id);
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
): Promise<Result<SettingsProfileSummary & { created: boolean }>> {
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

  // Only used to report created vs. overwritten; a concurrent save of the
  // same slot can at worst misreport this flag, never lose data.
  const existing = await dependencies.findProfile(input.actor.id, slotResult.value);

  // Annotations carry map coordinates, so they stay with the map rather than the profile.
  const saved = await dependencies.upsertProfile({
    name: nameResult.value,
    settings: { ...settings.value, annotations: [] },
    slot: slotResult.value,
    userId: input.actor.id
  });

  return ok({
    created: existing === null,
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

  const profile = await dependencies.findProfile(input.actor.id, slotResult.value);

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
