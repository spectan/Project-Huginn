import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE_NAME, hashSessionToken } from "./session";
import { toViewer, type AuthViewer } from "./viewer";

export async function getCurrentViewer(): Promise<AuthViewer | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token === undefined || token.length === 0) {
    return null;
  }

  const session = await prisma.session.findUnique({
    include: {
      user: true
    },
    where: {
      tokenHash: hashSessionToken(token)
    }
  });

  if (session === null || session.expiresAt <= new Date()) {
    return null;
  }

  const pendingApprovalCount = session.user.isAdmin
    ? await prisma.user.count({
        where: {
          approvalStatus: "PENDING"
        }
      })
    : 0;

  return toViewer(session.user, pendingApprovalCount);
}
