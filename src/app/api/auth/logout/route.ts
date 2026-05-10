import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session";
import { assertNoCoordinateMetadata } from "@/lib/domain/audit";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token !== undefined && token.length > 0) {
    const session = await prisma.session.findUnique({
      include: {
        user: true
      },
      where: {
        tokenHash: hashSessionToken(token)
      }
    });

    await prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token)
      }
    });

    if (session !== null) {
      const metadata = { username: session.user.username };
      assertNoCoordinateMetadata(metadata);
      await prisma.auditEvent.create({
        data: {
          action: "LOGOUT",
          actorUserId: session.userId,
          metadata,
          targetId: session.id,
          targetType: "SESSION"
        }
      });
    }
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
