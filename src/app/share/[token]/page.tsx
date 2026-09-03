import MapWorkspace from "@/app/map/map-workspace";
import { getWorkspaceData } from "@/app/map/page";
import type { AuthViewer } from "@/lib/auth/viewer";
import type { WorkspaceMap } from "@/lib/markers/marker-types";
import { createShareDependencies } from "@/lib/share/database";
import { resolveShareLink } from "@/lib/share/share-service";

type SharePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const result = await resolveShareLink(token, createShareDependencies());

  if (!result.ok) {
    return <InvalidShareLink />;
  }

  const { link } = result.value;
  const viewer = buildShareViewer(link.createdBy.id, link.mapId);
  const workspace = await getWorkspaceData(viewer, link.mapId);

  if (workspace === null) {
    return <InvalidShareLink />;
  }

  return (
    <MapWorkspace
      initialMarkers={workspace.markers}
      initialNoteCategories={workspace.noteCategories}
      initialSettings={link.settings}
      map={stampShareToken(workspace.map, token)}
      selectedLayerId={link.layerId ?? undefined}
      servers={workspace.servers}
      shareToken={token}
      viewer={viewer}
    />
  );
}

function InvalidShareLink() {
  return (
    <main className="map-page" aria-label="Shared map">
      <section className="map-locked" aria-label="Share link unavailable">
        <div className="map-locked-message">
          <strong>This share link is invalid or has expired.</strong>
          <span>Ask the person who shared it with you to generate a new one.</span>
        </div>
      </section>
    </main>
  );
}

function buildShareViewer(userId: string, mapId: string): AuthViewer {
  return {
    accessLevel: "READ",
    approvalStatus: "APPROVED",
    id: userId,
    isAdmin: false,
    mapPermissions: [{ accessLevel: "READ", isOperator: false, mapId }],
    pendingApprovalCount: 0,
    permissions: "READ",
    username: "Shared view"
  };
}

function stampShareToken(map: WorkspaceMap, token: string): WorkspaceMap {
  const shareParam = `&share=${encodeURIComponent(token)}`;

  return {
    ...map,
    imageSrc: `${map.imageSrc}${shareParam}`,
    layers: map.layers.map((layer) => ({
      ...layer,
      imageSrc: `${layer.imageSrc}${shareParam}`
    }))
  };
}
