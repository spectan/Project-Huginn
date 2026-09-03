import type { AuditHistoryEvent } from "@/lib/audit-history/audit-history";

type AuditHistoryViewProps = {
  events: AuditHistoryEvent[];
  nextCursor: string | null;
};

export function AuditHistoryView({ events, nextCursor }: AuditHistoryViewProps) {
  return (
    <>
      <h1 className="admin-page-title">History</h1>
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
                    <code className="admin-code">{formatMetadata(event.metadata)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor !== null ? (
        <nav className="admin-pagination" aria-label="History pages">
          <a href={`/admin/history?before=${encodeURIComponent(nextCursor)}`}>Older</a>
        </nav>
      ) : null}
    </>
  );
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
