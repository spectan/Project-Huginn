import { NextResponse } from "next/server";
import { updateAdminUser, removeAdminUser } from "@/lib/admin/users";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import type { AccessLevel, MapPermission } from "@/lib/domain/permissions";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const { userId } = await context.params;
  const result = await updateAdminUser({
    actor: viewer,
    isAdmin: getIsAdmin(body),
    mapPermissions: getMapPermissions(body),
    userId
  }, createAdminUserDependencies());

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Admin access is required" ? 403 : 400 }
    );
  }

  return NextResponse.json({ user: result.value });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const { userId } = await context.params;
  const result = await removeAdminUser({
    actor: viewer,
    userId
  }, createAdminUserDependencies());

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Admin access is required" ? 403 : 400 }
    );
  }

  return NextResponse.json({ userId: result.value.id });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getIsAdmin(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "isAdmin" in body &&
    body.isAdmin === true
  );
}

function getMapPermissions(body: unknown): MapPermission[] {
  if (
    typeof body !== "object" ||
    body === null ||
    !("mapPermissions" in body) ||
    !Array.isArray(body.mapPermissions)
  ) {
    return [];
  }

  return body.mapPermissions
    .filter(isMapPermissionInput)
    .map((permission) => ({
      accessLevel: permission.accessLevel,
      isOperator: permission.isOperator === true,
      mapId: permission.mapId
    }));
}

function isMapPermissionInput(value: unknown): value is {
  accessLevel: AccessLevel;
  isOperator?: boolean;
  mapId: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessLevel" in value &&
    isAccessLevel(value.accessLevel) &&
    "mapId" in value &&
    typeof value.mapId === "string" &&
    (!("isOperator" in value) || typeof value.isOperator === "boolean")
  );
}

function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "NONE" || value === "READ" || value === "WRITE";
}
