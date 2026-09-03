import { ok, type Result } from "@/lib/domain/result";
import {
  extractMarkerSignals,
  matchCanaries,
  type CanaryHit
} from "./canary-identify";
import type { CanaryRecord } from "./canary-service";

export type CanaryIdentifyMatch = {
  hits: CanaryHit[];
  mapId: string;
  mapName: string;
  userId: string;
  username: string;
};

export type CanaryIdentifyDependencies = {
  findMapNamesByIds(mapIds: string[]): Promise<Array<{ id: string; name: string }>>;
  findUsernamesByIds(userIds: string[]): Promise<Array<{ id: string; username: string }>>;
  listAllCanaryMarkers(): Promise<CanaryRecord[]>;
};

export async function identifyCanaryLeaks(
  text: string,
  dependencies: CanaryIdentifyDependencies
): Promise<Result<{ matches: CanaryIdentifyMatch[] }>> {
  const signals = extractMarkerSignals(text);

  if (signals.ids.length === 0 && signals.coordinates.length === 0) {
    return ok({ matches: [] });
  }

  const rows = await dependencies.listAllCanaryMarkers();
  const groups = matchCanaries(signals, rows);

  if (groups.length === 0) {
    return ok({ matches: [] });
  }

  const userIds = [...new Set(groups.map((group) => group.userId))];
  const mapIds = [...new Set(groups.map((group) => group.mapId))];

  const [users, maps] = await Promise.all([
    dependencies.findUsernamesByIds(userIds),
    dependencies.findMapNamesByIds(mapIds)
  ]);

  const usernames = new Map(users.map((user) => [user.id, user.username]));
  const mapNames = new Map(maps.map((map) => [map.id, map.name]));

  const matches = groups
    .map((group) => ({
      hits: group.hits,
      mapId: group.mapId,
      mapName: mapNames.get(group.mapId) ?? group.mapId,
      userId: group.userId,
      username: usernames.get(group.userId) ?? group.userId
    }))
    .sort((a, b) => b.hits.length - a.hits.length);

  return ok({ matches });
}
