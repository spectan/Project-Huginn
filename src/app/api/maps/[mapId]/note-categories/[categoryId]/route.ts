import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { hasPrismaErrorCode } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_NAME,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE,
  validateNoteCategoryInput
} from "@/lib/domain/note-categories";
import { canDeleteNoteCategories, canWriteMarkers } from "@/lib/domain/permissions";
import { readJson } from "@/lib/http/read-json";
import { findActiveMap, recordCategoryAudit, serializeCategory } from "@/lib/note-categories/database";

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

  // General is the fallback category that DELETE reassigns notes to.
  if (existing.name === DEFAULT_NOTE_CATEGORY_NAME && input.value.name !== DEFAULT_NOTE_CATEGORY_NAME) {
    return NextResponse.json({ error: "General category cannot be renamed" }, { status: 400 });
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
    if (hasPrismaErrorCode(error, "P2002")) {
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
