import { createAuditRecorder } from "@/lib/db/audit-recorder";
import { prisma } from "@/lib/db/prisma";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";

export type CategoryRecord = {
  color: string | null;
  id: string;
  markerShape: string;
  name: string;
  pipSize: number;
};

export function serializeCategory(category: CategoryRecord): CategoryRecord {
  return {
    color: category.color,
    id: category.id,
    markerShape: category.markerShape,
    name: category.name,
    pipSize: category.pipSize
  };
}

export async function findActiveMap(mapId: string): Promise<{ id: string } | null> {
  return prisma.map.findFirst({
    select: { id: true },
    where: {
      id: mapId,
      isActive: true
    }
  });
}

const recordAudit = createAuditRecorder();

/** Records a MAP_UPDATED audit event for a note category change. */
export async function recordCategoryAudit(input: {
  actorUserId: string;
  categoryId: string;
  categoryName: string;
  changedField: string;
  mapId: string;
}): Promise<void> {
  const metadata = {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    changedField: input.changedField
  };

  assertNoCoordinateMetadata(metadata);

  await recordAudit({
    action: "MAP_UPDATED",
    actorUserId: input.actorUserId,
    mapId: input.mapId,
    metadata,
    targetId: input.mapId,
    targetType: "MAP"
  });
}
