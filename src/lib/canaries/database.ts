import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CanaryDependencies, CanaryRecord } from "./canary-service";

export function createCanaryDependencies(): CanaryDependencies & {
  listAllCanaryMarkers(): Promise<CanaryRecord[]>;
} {
  return {
    listAllCanaryMarkers: async () => {
      const records = await prisma.canaryMarker.findMany({
        orderBy: [{ mapId: "asc" }, { userId: "asc" }, { slot: "asc" }]
      });

      return records.map(normalizeCanaryRecord);
    },
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
