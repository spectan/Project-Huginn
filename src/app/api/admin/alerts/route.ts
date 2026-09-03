import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canViewAuditLog } from "@/lib/domain/permissions";
import { detectAlerts, listAlerts } from "@/lib/alerts/alert-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional()
});

const bodySchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional()
});

export async function GET(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const result = await listAlerts(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ alerts: result.value });
}

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canViewAuditLog(viewer)) {
    return NextResponse.json(
      { error: "Admin access is required" },
      { status: 403 }
    );
  }

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = bodySchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const result = await detectAlerts({
    since: parsed.data.since === undefined ? undefined : new Date(parsed.data.since),
    until: parsed.data.until === undefined ? undefined : new Date(parsed.data.until)
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    alerts: result.value.alerts,
    created: result.value.created
  });
}
