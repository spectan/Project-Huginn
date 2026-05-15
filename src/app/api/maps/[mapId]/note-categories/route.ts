import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { MAX_NAME_LENGTH } from "@/lib/domain/constants";
import { canAdminister, canReadMap } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canReadMap(viewer)) {
    return NextResponse.json({ error: "Read access is required" }, { status: 403 });
  }

  const { mapId } = await context.params;
  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const categories = await prisma.noteCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    where: { mapId: map.id }
  });

  return NextResponse.json({ categories });
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canAdminister(viewer)) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const name = normalizeCategoryName(body);

  if (name === null) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const { mapId } = await context.params;
  const map = await findActiveMap(mapId);

  if (map === null) {
    return NextResponse.json({ error: "Map was not found" }, { status: 404 });
  }

  const category = await prisma.noteCategory.upsert({
    create: { mapId: map.id, name },
    update: {},
    where: {
      mapId_name: { mapId: map.id, name }
    }
  });

  await recordCategoryCreatedAudit({
    actorUserId: viewer.id,
    categoryId: category.id,
    categoryName: category.name,
    mapId: map.id
  });

  return NextResponse.json({
    category: {
      id: category.id,
      name: category.name
    }
  }, { status: 201 });
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

function normalizeCategoryName(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("name" in input)) {
    return null;
  }

  const value = input.name;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    return null;
  }

  return trimmed;
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
