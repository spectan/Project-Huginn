import { NextResponse } from "next/server";
import { loginUser } from "@/lib/auth/auth-service";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { createAuthDependencies } from "@/lib/auth/database";
import { getClientIp } from "@/lib/network/client-ip";

export async function POST(request: Request) {
  const body = await readJson(request);
  const clientIp = getClientIp(request);
  const result = await loginUser(body, createAuthDependencies(clientIp));

  if (!result.ok) {
    const response = NextResponse.json({ error: result.error }, { status: 401 });
    clearSessionCookie(response);
    return response;
  }

  const response = NextResponse.json({ viewer: result.value.viewer });
  setSessionCookie(response, result.value.sessionToken, result.value.sessionExpiresAt);
  return response;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
