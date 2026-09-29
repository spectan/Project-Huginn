import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDiscordDependencies } from "@/lib/discord/database";
import { getDiscordConfig, saveDiscordConfig } from "@/lib/discord/discord-service";
import { canViewAuditLog } from "@/lib/domain/permissions";
import { readJson } from "@/lib/http/read-json";

export async function GET() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const result = await getDiscordConfig(createDiscordDependencies());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ config: result.value });
}

export async function PUT(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const result = await saveDiscordConfig(await readJson(request), createDiscordDependencies());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ config: result.value });
}
