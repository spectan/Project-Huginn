import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canViewAuditLog } from "@/lib/domain/permissions";
import { acknowledgeAlert } from "@/lib/alerts/alert-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const result = await acknowledgeAlert(id, viewer.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ alert: result.value.alert });
}
