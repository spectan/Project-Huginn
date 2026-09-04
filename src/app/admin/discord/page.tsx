import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "../admin-access-denied";
import { DiscordView } from "./discord-view";

export default async function AdminDiscordPage() {
  const viewer = await getCurrentViewer();

  if (viewer === null || !viewer.isAdmin) {
    return <AdminAccessDenied title="Discord" />;
  }

  return <DiscordView />;
}
