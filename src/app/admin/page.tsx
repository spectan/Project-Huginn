import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { prisma } from "@/lib/db/prisma";
import { AdminAccessDenied } from "./admin-access-denied";
import { AlertsSection } from "./alerts-section";
import { CanarySection } from "./canary-section";
import { WatermarkSection } from "./watermark-section";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export default async function AdminDashboardPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <AdminAccessDenied title="Dashboard" />;
  }

  const [stats, users] = await Promise.all([loadAdminDashboardStats(), loadWatermarkUsers()]);

  return (
    <>
      <h1 className="admin-page-title">Dashboard</h1>
      <div className="admin-stat-grid">
        <div className="admin-stat">
          <span>Pending accounts</span>
          <strong>{stats.pendingAccounts}</strong>
        </div>
        <div className="admin-stat">
          <span>Unresolved alerts</span>
          <strong>{stats.unresolvedAlerts}</strong>
        </div>
        <div className="admin-stat">
          <span>Deleted markers expiring (24h)</span>
          <strong>{stats.expiringMarkers}</strong>
        </div>
        <div className="admin-stat">
          <span>Total users</span>
          <strong>{stats.totalUsers}</strong>
        </div>
      </div>
      <AlertsSection />
      <WatermarkSection users={users} />
      <CanarySection />
    </>
  );
}

async function loadAdminDashboardStats() {
  const expiringBefore = new Date(Date.now() + DAY_IN_MS);
  const expiringMarkerWhere = { deleteExpiresAt: { lte: expiringBefore } };

  const [pendingAccounts, unresolvedAlerts, totalUsers, ...expiringMarkerCounts] = await Promise.all([
    prisma.user.count({ where: { approvalStatus: "PENDING" } }),
    prisma.alert.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.user.count(),
    prisma.tower.count({ where: expiringMarkerWhere }),
    prisma.deed.count({ where: expiringMarkerWhere }),
    prisma.note.count({ where: expiringMarkerWhere }),
    prisma.rift.count({ where: expiringMarkerWhere }),
    prisma.camp.count({ where: expiringMarkerWhere }),
    prisma.minedoor.count({ where: expiringMarkerWhere }),
    prisma.locateSoul.count({ where: expiringMarkerWhere }),
    prisma.pathMarker.count({ where: expiringMarkerWhere })
  ]);

  return {
    expiringMarkers: expiringMarkerCounts.reduce((total, count) => total + count, 0),
    pendingAccounts,
    totalUsers,
    unresolvedAlerts
  };
}

async function loadWatermarkUsers() {
  return prisma.user.findMany({
    orderBy: { watermarkNumber: "asc" },
    select: { id: true, username: true, watermarkNumber: true }
  });
}
