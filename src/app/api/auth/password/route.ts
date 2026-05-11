import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { changeOwnPassword } from "@/lib/auth/auth-service";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { createAuthDependencies } from "@/lib/auth/database";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session";

export async function PATCH(request: Request) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  const body = await readJson(request);
  const result = await changeOwnPassword({
    actor: viewer,
    currentSessionTokenHash: await getCurrentSessionTokenHash(),
    input: body
  }, createAuthDependencies());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getCurrentSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token === undefined ? null : hashSessionToken(token);
}
