import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { AdminHeader } from "../admin-header";
import { WatermarkRevealView } from "./watermark-reveal-view";

export default async function WatermarkRevealPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <WatermarkRevealAccessDenied />;
  }

  const maps = await prisma.map.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { id: true, username: true },
  });

  return <WatermarkRevealView maps={maps} users={users} />;
}

function WatermarkRevealAccessDenied() {
  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin/watermark-reveal" title="Watermark" />
      <section className="history-empty">Admin access is required</section>
    </main>
  );
}
