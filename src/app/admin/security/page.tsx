import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { canAdminister } from "@/lib/domain/permissions";
import { AdminAccessDenied } from "../admin-access-denied";
import { CanarySection } from "../canary-section";
import { WatermarkSection } from "../watermark-section";
import { AdminAlertsView } from "./alerts-view";

export default async function AdminSecurityPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canAdminister(viewer)) {
    return <AdminAccessDenied title="Security" />;
  }

  const users = await loadWatermarkUsers();

  return (
    <>
      <h1 className="admin-page-title">Security</h1>
      <WatermarkSection users={users} />
      <CanarySection />
      <AdminAlertsView />
    </>
  );
}

async function loadWatermarkUsers() {
  return prisma.user.findMany({
    orderBy: { watermarkNumber: "asc" },
    select: { id: true, username: true, watermarkNumber: true },
    // Only users with a watermark number can be matched by the lookup.
    where: { watermarkNumber: { not: null } }
  });
}
