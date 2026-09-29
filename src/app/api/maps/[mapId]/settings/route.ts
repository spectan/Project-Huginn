import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createUserMapSettingsDependencies } from "@/lib/map-settings/database";
import { saveUserMapSettings } from "@/lib/map-settings/map-settings-service";
import { readJson } from "@/lib/http/read-json";
import { MAP_ERROR_STATUSES, getErrorStatus } from "@/lib/http/error-status";

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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, MAP_ERROR_STATUSES) });
  }

  return NextResponse.json({ settings: result.value });
}
