import type { AuditHistoryEvent } from "@/lib/audit-history/audit-history";
import { AuditHistoryFilters, type AuditHistoryFilterValues } from "./audit-history-filters";

const METADATA_HINT_LENGTH = 40;

type AuditHistoryViewProps = {
  events: AuditHistoryEvent[];
  filters: AuditHistoryFilterValues;
  maps: { id: string; name: string }[];
  nextCursor: string | null;
  users: { id: string; username: string }[];
};

export function AuditHistoryView({ events, filters, maps, nextCursor, users }: AuditHistoryViewProps) {
  return (
    <>
      <h1 className="admin-page-title">History</h1>
      <AuditHistoryFilters maps={maps} users={users} values={filters} />
      {events.length === 0 ? (
        <section className="admin-empty">No history events yet</section>
      ) : (
        <div className="admin-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Position</th>
                <th>Map</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                  </td>
                  <td>{event.actorUsername}</td>
                  <td>{formatAction(event.action)}</td>
                  <td>
                    {event.x !== null && event.y !== null && event.mapId !== null ? (
                      <a
                        href={`/map?server=${getMapSlug(event.mapId)}&x=${event.x}&y=${event.y}`}
                        title={`View ${formatTargetType(event.targetType)} at ${event.x}, ${event.y}`}
                      >
                        <span>{formatTargetType(event.targetType)}</span>
                        {event.targetId !== null ? <small>{event.targetId}</small> : null}
                      </a>
                    ) : (
                      <>
                        <span>{formatTargetType(event.targetType)}</span>
                        {event.targetId !== null ? <small>{event.targetId}</small> : null}
                      </>
                    )}
                  </td>
                  <td>{formatPosition(event.x, event.y)}</td>
                  <td>{event.mapName.length > 0 ? event.mapName : "None"}</td>
                  <td>
                    <details className="admin-details">
                      <summary>{formatMetadataHint(event.metadata)}</summary>
                      <code className="admin-code">{formatMetadata(event.metadata)}</code>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor !== null ? (
        <nav className="admin-pagination" aria-label="History pages">
          <a href={buildPageHref(filters, nextCursor)}>
            {filters.order === "asc" ? "Newer" : "Older"}
          </a>
        </nav>
      ) : null}
    </>
  );
}

function buildPageHref(filters: AuditHistoryFilterValues, cursor: string): string {
  const params = new URLSearchParams();

  if (filters.actorUserId !== "") {
    params.set("user", filters.actorUserId);
  }

  if (filters.actionGroup !== "") {
    params.set("action", filters.actionGroup);
  }

  if (filters.mapId !== "") {
    params.set("map", filters.mapId);
  }

  if (filters.order !== "desc") {
    params.set("sort", filters.order);
  }

  params.set("before", cursor);

  return `/admin/history?${params.toString()}`;
}

function getMapSlug(mapId: string): string {
  return mapId.startsWith("map-") ? mapId.slice(4) : mapId;
}

function formatTimestamp(value: string): string {
  return value.replace("T", " ").replace(".000Z", " UTC");
}

function formatAction(action: AuditHistoryEvent["action"]): string {
  const words = action
    .toLowerCase()
    .split("_")
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      return word;
    });

  return words.join(" ");
}

function formatTargetType(type: AuditHistoryEvent["targetType"]): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function formatPosition(x: number | null, y: number | null): string {
  if (x === null || y === null) {
    return "—";
  }

  return `${x}, ${y}`;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  if (Object.keys(metadata).length === 0) {
    return "{}";
  }

  return JSON.stringify(metadata);
}

function formatMetadataHint(metadata: Record<string, unknown>): string {
  const formatted = formatMetadata(metadata);

  if (formatted.length <= METADATA_HINT_LENGTH) {
    return "Metadata";
  }

  return `${formatted.slice(0, METADATA_HINT_LENGTH)}…`;
}
