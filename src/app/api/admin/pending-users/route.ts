import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canAdminister } from "@/lib/domain/permissions";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canAdminister(viewer)) {
    return NextResponse.json({ error: "Admin access is required" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: "asc"
    },
    select: {
      createdAt: true,
      id: true,
      username: true
    },
    take: 100,
    where: {
      approvalStatus: "PENDING"
    }
  });

  return NextResponse.json({
    users: users.map((user) => ({
      createdAt: user.createdAt.toISOString(),
      id: user.id,
      username: user.username
    }))
  });
}
