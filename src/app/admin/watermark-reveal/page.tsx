import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
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
      <header className="history-header">
        <div>
          <p>Admin</p>
          <h1>Reveal Watermark</h1>
        </div>
        <a href="/map">Map</a>
      </header>
      <section className="history-empty">Admin access is required</section>
    </main>
  );
}
