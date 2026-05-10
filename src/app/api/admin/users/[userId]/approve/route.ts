import { NextResponse } from "next/server";
import { approveUser } from "@/lib/auth/auth-service";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createAuthDependencies } from "@/lib/auth/database";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const { userId } = await context.params;
  const accessLevel = getAccessLevel(body);
  const result = await approveUser({
    accessLevel,
    actor: viewer,
    userId
  }, createAuthDependencies());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ viewer: result.value });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getAccessLevel(body: unknown): "NONE" | "READ" | "WRITE" {
  if (
    typeof body === "object" &&
    body !== null &&
    "accessLevel" in body &&
    (body.accessLevel === "READ" || body.accessLevel === "WRITE")
  ) {
    return body.accessLevel;
  }

  return "NONE";
}
