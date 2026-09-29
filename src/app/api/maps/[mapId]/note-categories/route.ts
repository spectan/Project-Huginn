import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { hasPrismaErrorCode } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { validateNoteCategoryInput } from "@/lib/domain/note-categories";
import { canReadMap, canWriteMarkers } from "@/lib/domain/permissions";
import { readJson } from "@/lib/http/read-json";
import {
  type CategoryRecord,
  findActiveMap,
  recordCategoryAudit,
  serializeCategory
} from "@/lib/note-categories/database";

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
    const concurrent = hasPrismaErrorCode(error, "P2002")
      ? await prisma.noteCategory.findUnique({ where })
      : null;

    if (concurrent === null) {
      throw error;
    }

    return NextResponse.json({ category: serializeCategory(concurrent) });
  }

  await recordCategoryAudit({
    actorUserId: viewer.id,
    categoryId: category.id,
    categoryName: category.name,
    changedField: "noteCategory",
    mapId: map.id
  });

  return NextResponse.json({ category: serializeCategory(category) }, { status: 201 });
}
