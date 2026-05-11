import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createUserMapSettingsDependencies } from "@/lib/map-settings/database";
import { saveUserMapSettings } from "@/lib/map-settings/map-settings-service";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const body = await readJson(request);
  const { mapId } = await context.params;
  const result = await saveUserMapSettings(
    { actor: viewer, input: body, mapId },
    createUserMapSettingsDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
  }

  return NextResponse.json({ settings: result.value });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getErrorStatus(error: string): number {
  if (error === "Read access is required") {
    return 403;
  }

  if (error === "Map was not found") {
    return 404;
  }

  return 400;
}
