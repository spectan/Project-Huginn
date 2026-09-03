import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { AdminHeader } from "../admin-header";
import { WatermarkRevealView } from "./watermark-reveal-view";

export default async function WatermarkRevealPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <WatermarkRevealAccessDenied />;
  }

  const users = await prisma.user.findMany({
    orderBy: { watermarkNumber: "asc" },
    select: { id: true, username: true, watermarkNumber: true },
  });

  return <WatermarkRevealView users={users} />;
}

function WatermarkRevealAccessDenied() {
  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin/watermark-reveal" title="Watermark" />
      <section className="history-empty">Admin access is required</section>
    </main>
  );
}
