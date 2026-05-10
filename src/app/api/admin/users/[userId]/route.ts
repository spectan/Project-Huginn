import { NextResponse } from "next/server";
import { updateAdminUser, removeAdminUser } from "@/lib/admin/users";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import type { AccessLevel } from "@/lib/domain/permissions";

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
    accessLevel: getAccessLevel(body),
    actor: viewer,
    isAdmin: getIsAdmin(body),
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

function getAccessLevel(body: unknown): AccessLevel {
  if (
    typeof body === "object" &&
    body !== null &&
    "accessLevel" in body &&
    (body.accessLevel === "NONE" || body.accessLevel === "READ" || body.accessLevel === "WRITE")
  ) {
    return body.accessLevel;
  }

  return "NONE";
}

function getIsAdmin(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "isAdmin" in body &&
    body.isAdmin === true
  );
}
