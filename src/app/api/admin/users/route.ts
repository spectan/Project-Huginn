import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createAdminUserDependencies } from "@/lib/admin/users-database";
import { listAdminUsers } from "@/lib/admin/users";

export async function GET() {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const result = await listAdminUsers(
    { actor: viewer },
    createAdminUserDependencies()
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json(result.value);
}
