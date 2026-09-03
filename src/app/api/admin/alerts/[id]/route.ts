import { NextResponse } from "next/server";
import { deleteAlert } from "@/lib/alerts/alert-service";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canViewAuditLog } from "@/lib/domain/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const result = await deleteAlert(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
