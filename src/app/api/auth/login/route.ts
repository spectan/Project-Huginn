import { NextResponse } from "next/server";
import { loginUser, TOO_MANY_ATTEMPTS_MESSAGE } from "@/lib/auth/auth-service";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { createAuthDependencies } from "@/lib/auth/database";
import { getClientIp } from "@/lib/network/client-ip";
import { readJson } from "@/lib/http/read-json";

export async function POST(request: Request) {
  const body = await readJson(request);
  const clientIp = getClientIp(request);
  const result = await loginUser(body, createAuthDependencies(clientIp), { clientIp });

  if (!result.ok) {
    if (result.error === TOO_MANY_ATTEMPTS_MESSAGE) {
      // Throttled requests never reached the credential check, so an existing
      // session is left alone.
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    const response = NextResponse.json({ error: result.error }, { status: 401 });
    clearSessionCookie(response);
    return response;
  }

  const response = NextResponse.json({ viewer: result.value.viewer });
  setSessionCookie(response, result.value.sessionToken, result.value.sessionExpiresAt);
  return response;
}
