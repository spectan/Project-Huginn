import { NextResponse } from "next/server";
import { updateAdminUserPassword } from "@/lib/admin/users";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { getClientIp } from "@/lib/network/client-ip";
import { readJson } from "@/lib/http/read-json";
import { ADMIN_USER_ERROR_STATUSES, getErrorStatus } from "@/lib/http/error-status";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const body = await readJson(request);
  const { userId } = await context.params;
  const result = await updateAdminUserPassword({
    actor: viewer,
    password: getPassword(body),
    userId
  }, createAdminUserDependencies(getClientIp(request)));

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: getErrorStatus(result.error, ADMIN_USER_ERROR_STATUSES) }
    );
  }

  return NextResponse.json({ user: result.value });
}

function getPassword(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof body.password === "string"
  ) {
    return body.password;
  }

  return "";
}
