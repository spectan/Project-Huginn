import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createDiscordDependencies } from "@/lib/discord/database";
import {
  DISCORD_NOT_CONFIGURED_ERROR,
  sendTestNotification
} from "@/lib/discord/discord-service";
import { canViewAuditLog } from "@/lib/domain/permissions";

export async function POST() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const result = await sendTestNotification(
    { username: viewer.username },
    createDiscordDependencies()
  );

  if (!result.ok) {
    const status = result.error === DISCORD_NOT_CONFIGURED_ERROR ? 400 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
