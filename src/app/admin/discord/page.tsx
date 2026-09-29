import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { canAdminister } from "@/lib/domain/permissions";
import { AdminAccessDenied } from "../admin-access-denied";
import { DiscordView } from "./discord-view";

export default async function AdminDiscordPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !canAdminister(viewer)) {
    return <AdminAccessDenied title="Discord" />;
  }

  return <DiscordView />;
}
