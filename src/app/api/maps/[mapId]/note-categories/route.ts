import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  validateNoteCategoryInput
} from "@/lib/domain/note-categories";
import { canReadMap, canWriteMarkers } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();
  const { mapId } = await context.params;

  if (viewer === null || !canReadMap(viewer, mapId)) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const categories = await prisma.noteCategory.findMany({
    orderBy: { name: "asc" },
    select: { color: true, id: true, markerShape: true, name: true, pipSize: true },
    where: { mapId: map.id }
  });

  return NextResponse.json({ categories });
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();
  const { mapId } = await context.params;

  if (viewer === null || !canWriteMarkers(viewer, mapId)) {
    return NextResponse.json({ error: "Write access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const input = validateNoteCategoryInput(body);

  if (!input.ok) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const where = { mapId_name: { mapId: map.id, name: input.value.name } };
  const existing = await prisma.noteCategory.findUnique({ where });

  if (existing !== null) {
    return NextResponse.json({ category: serializeCategory(existing) });
  }

  let category: CategoryRecord;

  try {
    category = await prisma.noteCategory.create({
      data: {
        mapId: map.id,
        name: input.value.name
      }
    });
  } catch (error) {
    // Another request created the same category concurrently.
    const concurrent = isUniqueConstraintError(error)
      ? await prisma.noteCategory.findUnique({ where })
      : null;

    if (concurrent === null) {
      throw error;
    }

    return NextResponse.json({ category: serializeCategory(concurrent) });
  }

  await recordCategoryCreatedAudit({
    actorUserId: viewer.id,
    categoryId: category.id,
    categoryName: category.name,
    mapId: map.id
  });

  return NextResponse.json({ category: serializeCategory(category) }, { status: 201 });
}

type CategoryRecord = {
  color: string | null;
  id: string;
  markerShape: string;
  name: string;
  pipSize: number;
};

function serializeCategory(category: CategoryRecord): CategoryRecord {
  return {
    color: category.color,
    id: category.id,
    markerShape: category.markerShape,
    name: category.name,
    pipSize: category.pipSize
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002";
}

async function findActiveMap(mapId: string): Promise<{ id: string } | null> {
  return prisma.map.findFirst({
    select: { id: true },
    where: {
      id: mapId,
      isActive: true
    }
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function recordCategoryCreatedAudit(input: {
  actorUserId: string;
  categoryId: string;
  categoryName: string;
  mapId: string;
}): Promise<void> {
  const metadata = {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    changedField: "noteCategory"
  };

  assertNoCoordinateMetadata(metadata);

  await prisma.auditEvent.create({
    data: {
      action: "MAP_UPDATED",
      actorUserId: input.actorUserId,
      mapId: input.mapId,
      metadata: metadata as Prisma.InputJsonValue,
      targetId: input.mapId,
      targetType: "MAP"
    }
  });
}
