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

export type UserMapSettingsDependencies = {
  findMap(mapId: string): Promise<MapRecord | null>;
  findSettings(userId: string, mapId: string): Promise<UserMapSettingsRecord | null>;
  upsertSettings(input: {
    mapId: string;
    settings: UserMapSettings;
    userId: string;
  }): Promise<UserMapSettingsRecord>;
};

export async function getUserMapSettings(
  input: { actor: Actor; mapId: string },
  dependencies: UserMapSettingsDependencies
): Promise<Result<UserMapSettings>> {
  if (!canReadMap(input.actor)) {
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
  if (!canReadMap(input.actor)) {
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
