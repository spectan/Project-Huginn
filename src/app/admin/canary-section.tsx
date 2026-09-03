"use client";

import { useState } from "react";

type IdentifyHit = {
  slot: number;
  type: string;
  x: number | null;
  y: number | null;
};

type IdentifyMatch = {
  hits: IdentifyHit[];
  mapId: string;
  mapName: string;
  userId: string;
  username: string;
};

export function CanarySection() {
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<IdentifyMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length === 0) {
      return;
    }

    setLoading(true);
    setMatches(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/canaries/identify", {
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Failed to identify canaries");
      } else {
        setMatches(body.matches ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-panel">
      <h2 className="admin-section-title">Canaries</h2>
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="canary-dump">Paste a leaked marker dump (JSON or plain text):</label>
        </p>
        <textarea
          id="canary-dump"
          className="admin-textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{"id": "...", "type": "tower", "x": 123, "y": 456}, ...]'
        />
        <p>
          <button className="admin-btn" type="submit" disabled={loading || text.trim().length === 0}>
            {loading ? "Identifying..." : "Identify"}
          </button>
        </p>
      </form>

      {error !== null && (
        <p>
          <span className="admin-pill admin-pill--danger">{error}</span>
        </p>
      )}

      {matches !== null && matches.length === 0 && (
        <div className="admin-empty">No canary matches found.</div>
      )}

      {matches !== null && matches.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Map</th>
              <th>Hits</th>
              <th>Matched canaries</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={`${match.userId}:${match.mapId}`}>
                <td>
                  <strong>{match.username}</strong>
                </td>
                <td>{match.mapName}</td>
                <td>{match.hits.length}</td>
                <td>
                  {match.hits.map((hit) => (
                    <code key={hit.slot} className="admin-code">
                      {hit.x === null || hit.y === null
                        ? hit.type
                        : `${hit.type} (${hit.x}, ${hit.y})`}
                    </code>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
