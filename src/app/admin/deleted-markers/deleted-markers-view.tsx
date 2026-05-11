"use client";

import { useState } from "react";
import type { DeletedMarkerSummary } from "@/lib/deleted-markers/deleted-marker-service";

type DeletedMarkersViewProps = {
  markers: readonly DeletedMarkerSummary[];
};

export function DeletedMarkersView({ markers }: DeletedMarkersViewProps) {
  const [pendingMarkerId, setPendingMarkerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="history-page history-page--dark">
      <header className="history-header">
        <div>
          <p>Admin</p>
          <h1>Deleted markers</h1>
        </div>
        <a href="/map">Map</a>
      </header>
      {error !== null ? <section className="history-empty">{error}</section> : null}
      {markers.length === 0 ? (
        <section className="history-empty">No restorable deleted markers</section>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Marker</th>
                <th>Map</th>
                <th>Position</th>
                <th>Deleted by</th>
                <th>Deleted at</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {markers.map((marker) => (
                <tr key={`${marker.type}-${marker.id}`}>
                  <td>
                    <strong>{marker.label}</strong>
                    <small>{formatMarkerType(marker.type)}</small>
                  </td>
                  <td>{marker.mapName}</td>
                  <td>{marker.x}, {marker.y}</td>
                  <td>{marker.deletedByUsername}</td>
                  <td>
                    <time dateTime={marker.deletedAt}>{formatTimestamp(marker.deletedAt)}</time>
                  </td>
                  <td>
                    <time dateTime={marker.deleteExpiresAt}>
                      {formatTimestamp(marker.deleteExpiresAt)}
                    </time>
                  </td>
                  <td>
                    <button
                      aria-label={`Restore ${marker.label}`}
                      className="history-action-button"
                      disabled={pendingMarkerId === marker.id}
                      onClick={() => {
                        setPendingMarkerId(marker.id);
                        setError(null);
                        void restoreMarker(marker, setError, setPendingMarkerId);
                      }}
                      type="button"
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

async function restoreMarker(
  marker: DeletedMarkerSummary,
  setError: (error: string | null) => void,
  setPendingMarkerId: (id: string | null) => void
): Promise<void> {
  const response = await fetch(
    `/api/admin/deleted-markers/${marker.type}/${marker.id}/restore`,
    { method: "POST" }
  );

  if (response.ok) {
    window.location.reload();
    return;
  }

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  setError(body?.error ?? "Marker could not be restored");
  setPendingMarkerId(null);
}

function formatMarkerType(type: DeletedMarkerSummary["type"]): string {
  if (type === "tower") {
    return "Tower";
  }

  if (type === "deed") {
    return "Deed";
  }

  if (type === "rift") {
    return "Rift";
  }

  if (type === "camp") {
    return "Camp";
  }

  if (type === "minedoor") {
    return "Minedoor";
  }

  if (type === "bridge") {
    return "Bridge";
  }

  if (type === "canal") {
    return "Canal";
  }

  if (type === "highway") {
    return "Highway";
  }

  return "Note";
}

function formatTimestamp(value: string): string {
  return value.replace("T", " ").replace(".000Z", " UTC");
}
