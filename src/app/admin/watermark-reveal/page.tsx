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

  return <WatermarkRevealView maps={maps} />;
}

function WatermarkRevealAccessDenied() {
  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin/watermark-reveal" title="Reveal Watermark" />
      <section className="history-empty">Admin access is required</section>
    </main>
  );
}
