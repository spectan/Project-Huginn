import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { WorkspaceMarker } from "@/lib/markers/marker-types";
import type { CanaryRecord } from "./canary-service";

export type CanaryDependencies = {
  listCanaryMarkers(input: { mapId: string; userId: string }): Promise<CanaryRecord[]>;
  createCanaryMarkers(input: {
    mapId: string;
    markers: Array<{ payload: WorkspaceMarker; slot: number }>;
    userId: string;
  }): Promise<CanaryRecord[]>;
};

export function createCanaryDependencies(): CanaryDependencies {
  return {
    listCanaryMarkers: async ({ mapId, userId }) => {
      const records = await prisma.canaryMarker.findMany({
        orderBy: { slot: "asc" },
        where: { mapId, userId }
      });

      return records.map(normalizeCanaryRecord);
    },
    createCanaryMarkers: async ({ mapId, markers, userId }) => {
      await prisma.canaryMarker.createMany({
        data: markers.map((marker) => ({
          mapId,
          payload: marker.payload as Prisma.InputJsonValue,
          slot: marker.slot,
          userId
        }))
      });

      const records = await prisma.canaryMarker.findMany({
        orderBy: { slot: "asc" },
        where: { mapId, userId }
      });

      return records.map(normalizeCanaryRecord);
    }
  };
}

function normalizeCanaryRecord(record: {
  id: string;
  mapId: string;
  payload: Prisma.JsonValue;
  slot: number;
  userId: string;
}): CanaryRecord {
  return {
    id: record.id,
    mapId: record.mapId,
    payload: record.payload,
    slot: record.slot,
    userId: record.userId
  };
}
