import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_NAME,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE,
  validateNoteCategoryInput
} from "@/lib/domain/note-categories";
import { canDeleteNoteCategories, canWriteMarkers } from "@/lib/domain/permissions";

type RouteContext = {
  params: Promise<{
    categoryId: string;
    mapId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();
  const { categoryId, mapId } = await context.params;

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

  const existing = await prisma.noteCategory.findFirst({
    select: { id: true, mapId: true, name: true },
    where: {
      id: categoryId,
      mapId: map.id
    }
  });

  if (existing === null) {
    return NextResponse.json({ error: "Category was not found" }, { status: 404 });
  }

  try {
    const category = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.noteCategory.update({
        data: {
          name: input.value.name
        },
        where: { id: existing.id }
      });

      if (existing.name !== updated.name) {
        await transaction.note.updateMany({
          data: { category: updated.name },
          where: {
            category: existing.name,
            mapId: map.id
          }
        });
      }

      return updated;
    });

    await recordCategoryAudit({
      actorUserId: viewer.id,
      categoryId: category.id,
      categoryName: category.name,
      changedField: "noteCategory",
      mapId: map.id
    });

    return NextResponse.json({
      category: serializeCategory(category)
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canDeleteNoteCategories(viewer)) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const { categoryId, mapId } = await context.params;
  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const existing = await prisma.noteCategory.findFirst({
    select: { id: true, mapId: true, name: true },
    where: {
      id: categoryId,
      mapId: map.id
    }
  });

  if (existing === null) {
    return NextResponse.json({ error: "Category was not found" }, { status: 404 });
  }

  if (existing.name === DEFAULT_NOTE_CATEGORY_NAME) {
    return NextResponse.json({ error: "General category cannot be deleted" }, { status: 400 });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.noteCategory.upsert({
      create: {
        color: null,
        mapId: map.id,
        markerShape: DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
        name: DEFAULT_NOTE_CATEGORY_NAME,
        pipSize: DEFAULT_NOTE_CATEGORY_PIP_SIZE
      },
      update: {},
      where: {
        mapId_name: {
          mapId: map.id,
          name: DEFAULT_NOTE_CATEGORY_NAME
        }
      }
    });
    await transaction.note.updateMany({
      data: { category: DEFAULT_NOTE_CATEGORY_NAME },
      where: {
        category: existing.name,
        mapId: map.id
      }
    });
    await transaction.noteCategory.delete({
      where: { id: existing.id }
    });
  });

  await recordCategoryAudit({
    actorUserId: viewer.id,
    categoryId: existing.id,
    categoryName: existing.name,
    changedField: "noteCategoryDeleted",
    mapId: map.id
  });

  return NextResponse.json({
    category: {
      id: existing.id,
      reassignedTo: DEFAULT_NOTE_CATEGORY_NAME
    }
  });
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

function serializeCategory(category: {
  color: string | null;
  id: string;
  markerShape: string;
  name: string;
  pipSize: number;
}) {
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

async function recordCategoryAudit(input: {
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
