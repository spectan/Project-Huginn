"use client";

import { useState } from "react";

type MapOption = {
  id: string;
  name: string;
};

type RevealResult = {
  found: boolean;
  username: string | null;
  datestamp: string | null;
  confidence: number;
  checksumValid: boolean;
};

export function WatermarkRevealView({ maps }: { maps: MapOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [mapId, setMapId] = useState<string>(maps[0]?.id ?? "");
  const [result, setResult] = useState<RevealResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (file === null || mapId.length === 0) {
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("mapId", mapId);

    try {
      const response = await fetch("/api/admin/watermark-reveal", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        setResult({
          found: false,
          username: null,
          datestamp: null,
          confidence: 0,
          checksumValid: false,
        });
        alert(error.error ?? "Failed to reveal watermark");
      } else {
        const data = await response.json();
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="history-page history-page--dark">
      <header className="history-header">
        <div>
          <p>Admin</p>
          <h1>Reveal Watermark</h1>
        </div>
        <a href="/map">Map</a>
      </header>

      <section className="history-empty">
        <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="mapId">Map</label>
            <select
              id="mapId"
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="image">Screenshot or frame</label>
            <input
              id="image"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: "block", marginTop: 4 }}
            />
          </div>

          <button type="submit" disabled={loading || file === null}>
            {loading ? "Revealing..." : "Reveal Watermark"}
          </button>
        </form>

        {result !== null && (
          <div style={{ marginTop: 24 }}>
            {result.found ? (
              <div>
                <p>
                  <strong>User:</strong> {result.username}
                </p>
                <p>
                  <strong>Date:</strong> {result.datestamp}
                </p>
                <p>
                  <strong>Confidence:</strong>{" "}
                  {Math.round(result.confidence * 100)}%
                </p>
                <p>
                  <strong>Checksum:</strong>{" "}
                  {result.checksumValid ? "valid" : "invalid"}
                </p>
              </div>
            ) : (
              <p>No watermark found</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
