import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createSettingsProfilesDependencies } from "@/lib/map-settings/database";
import { listSettingsProfiles } from "@/lib/map-settings/map-settings-service";

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
    return NextResponse.json({ error: result.error }, { status: getErrorStatus(result.error) });
  }

  return NextResponse.json({ profiles: result.value });
}

function getErrorStatus(error: string): number {
  if (error === "Read access is required") {
    return 403;
  }

  if (error === "Map was not found" || error === "Profile was not found") {
    return 404;
  }

  return 400;
}
