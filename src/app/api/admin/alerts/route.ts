import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canViewAuditLog } from "@/lib/domain/permissions";
import { detectAlerts, listAlerts } from "@/lib/alerts/alert-service";
import { readJson } from "@/lib/http/read-json";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional()
});

/** Manual detection may scan at most this long a range (bounds the audit scan). */
const MAX_DETECTION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

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

  const body = await readJson(request);

  const parsed = bodySchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const until = parsed.data.until === undefined ? undefined : new Date(parsed.data.until);
  const result = await detectAlerts({
    since: parsed.data.since === undefined
      ? undefined
      : clampSince(new Date(parsed.data.since), until ?? new Date()),
    until
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    alerts: result.value.alerts,
    created: result.value.created
  });
}

/** The scanned range [since, until] spans at most MAX_DETECTION_LOOKBACK_MS. */
function clampSince(since: Date, until: Date): Date {
  const earliest = until.getTime() - MAX_DETECTION_LOOKBACK_MS;

  return since.getTime() < earliest ? new Date(earliest) : since;
}
