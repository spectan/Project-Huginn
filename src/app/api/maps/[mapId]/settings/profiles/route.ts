import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createSettingsProfilesDependencies } from "@/lib/map-settings/database";
import { listSettingsProfiles } from "@/lib/map-settings/map-settings-service";
import { MAP_ERROR_STATUSES, getErrorStatus } from "@/lib/http/error-status";

type RouteContext = {
  params: Promise<{
    mapId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const { mapId } = await context.params;
  const result = await listSettingsProfiles(
    { actor: viewer, mapId },
    createSettingsProfilesDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error, MAP_ERROR_STATUSES) });
  }

  return NextResponse.json({ profiles: result.value });
}
