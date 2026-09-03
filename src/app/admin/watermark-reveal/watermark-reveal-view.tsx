"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../admin-header";

type MapOption = {
  id: string;
  name: string;
};

type UserOption = {
  id: string;
  username: string | null;
};

type RevealResult = {
  found: boolean;
  username: string | null;
  userId: string | null;
  watermarkNumber: number | null;
  confidence: number;
  syncConfidence: number;
  softConfidence: number;
  syncSoftConfidence: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function WatermarkRevealView({
  maps,
  users,
}: {
  maps: MapOption[];
  users: UserOption[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [mapId, setMapId] = useState<string>(maps[0]?.id ?? "");
  const [userId, setUserId] = useState<string>("");
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
    if (userId.length > 0) {
      formData.append("userId", userId);
    }

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
          userId: null,
          watermarkNumber: null,
          confidence: 0,
          syncConfidence: 0,
          softConfidence: 0,
          syncSoftConfidence: 0,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        });
        alert(error.error ?? "Failed to reveal watermark");
      } else {
        const data = await response.json();
        setResult(data);
      }
    } finally {
      setLoading(false);
      setFile(null);
      setFileInputKey((k) => k + 1);
    }
  }

  async function handlePaste(event: ClipboardEvent | React.ClipboardEvent) {
    const clipboardData =
      "clipboardData" in event && event.clipboardData !== null
        ? event.clipboardData
        : null;
    if (clipboardData === null) {
      return;
    }

    for (const item of Array.from(clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file !== null) {
          setFile(file);
          event.preventDefault();
          return;
        }
      }
    }
  }

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, []);

  return (
    <main className="history-page history-page--dark">
      <AdminHeader currentRoute="/admin/watermark-reveal" title="Watermark" />

      <section className="history-empty">
        <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="mapId">Map</label>
            <select
              id="mapId"
              value={mapId}
              onChange={(e) => {
                setMapId(e.target.value);
                setUserId("");
              }}
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
            <label htmlFor="userId">User (optional)</label>
            <select
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">All users with map access</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username ?? user.id}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="image">Screenshot or frame</label>
            <div
              onPaste={handlePaste}
              tabIndex={0}
              style={{
                border: "2px dashed #666",
                borderRadius: 8,
                padding: 24,
                marginTop: 4,
                textAlign: "center",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {file === null ? (
                <p>Paste an image (Ctrl+V / Cmd+V) or use the file input below</p>
              ) : (
                <p>
                  <strong>Ready:</strong> {file.name} ({Math.round(file.size / 1024)} KB)
                </p>
              )}
              <input
                key={fileInputKey}
                id="image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{ display: "block", marginTop: 12, width: "100%" }}
              />
            </div>
          </div>

          <button type="submit" disabled={loading || file === null}>
            {loading ? "Revealing..." : "Reveal"}
          </button>
        </form>

        {result !== null && (
          <div style={{ marginTop: 24 }}>
            {result.found ? (
              <p>
                <strong>User:</strong> {result.username} ({result.userId})
              </p>
            ) : result.userId ? (
              <p>
                <strong>Uncertain match:</strong> {result.username} ({result.userId}) — confidence below certainty threshold
              </p>
            ) : (
              <p>No watermark found</p>
            )}
            <p>
              <strong>Confidence:</strong>{" "}
              {Math.round(result.confidence * 100)}%
            </p>
            <p>
              <strong>Sync confidence:</strong>{" "}
              {Math.round(result.syncConfidence * 100)}%
            </p>
            <p>
              <strong>Soft confidence:</strong>{" "}
              {result.softConfidence.toFixed(3)}
            </p>
            <p>
              <strong>Sync soft confidence:</strong>{" "}
              {result.syncSoftConfidence.toFixed(3)}
            </p>
            <p>
              <strong>Scale:</strong> {result.scale}
            </p>
            <p>
              <strong>Offset:</strong> ({result.offsetX}, {result.offsetY})
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
