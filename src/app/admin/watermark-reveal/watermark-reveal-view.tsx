"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "../admin-header";

type UserOption = {
  id: string;
  username: string | null;
  watermarkNumber: number | null;
};

type RevealResult = {
  saturationPreview: string | null;
  chromaPreview: string | null;
};

export function WatermarkRevealView({ users }: { users: UserOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const watermarkedUsers = users
    .filter((user) => user.watermarkNumber !== null)
    .map((user) => ({
      ...user,
      paddedNumber: String(user.watermarkNumber).padStart(4, "0"),
    }));
  const paddedDigits = digits.trim().padStart(4, "0");
  const matchedNumber = digits.trim().length > 0 ? paddedDigits : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (file === null) {
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/admin/watermark-reveal", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "Failed to enhance image");
      } else {
        setResult(await response.json());
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
        const pastedFile = item.getAsFile();
        if (pastedFile !== null) {
          setFile(pastedFile);
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
            {loading ? "Enhancing..." : "Enhance"}
          </button>
        </form>

        {error !== null && <p style={{ marginTop: 16 }}>{error}</p>}

        {result !== null && (
          <div style={{ marginTop: 24 }}>
            <p>
              Read the overlaid digits off either rendering, then type them into
              the Digits field below to match a user.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ flex: "1 1 320px" }}>
                <p>
                  <strong>Saturation boost</strong>
                </p>
                {result.saturationPreview !== null ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data-URL preview with unknown dimensions */
                  <img
                    src={result.saturationPreview}
                    alt="Saturation-boosted watermark preview"
                    style={{ maxWidth: "100%", border: "1px solid #444", borderRadius: 4, imageRendering: "pixelated" }}
                  />
                ) : (
                  <p>Enhancement failed for this image</p>
                )}
              </div>
              <div style={{ flex: "1 1 320px" }}>
                <p>
                  <strong>Chroma isolation</strong>
                </p>
                {result.chromaPreview !== null ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data-URL preview with unknown dimensions */
                  <img
                    src={result.chromaPreview}
                    alt="Chroma-isolated watermark preview"
                    style={{ maxWidth: "100%", border: "1px solid #444", borderRadius: 4, imageRendering: "pixelated" }}
                  />
                ) : (
                  <p>Enhancement failed for this image</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, maxWidth: 600 }}>
          <label htmlFor="digits">Digits</label>
          <input
            id="digits"
            type="text"
            inputMode="numeric"
            value={digits}
            onChange={(e) => setDigits(e.target.value)}
            placeholder="Digits read off the enhanced image"
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />

          <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 4 }}>Number</th>
                <th style={{ textAlign: "left", padding: 4 }}>Username</th>
              </tr>
            </thead>
            <tbody>
              {watermarkedUsers.map((user) => {
                const isMatch = matchedNumber !== null && user.paddedNumber === matchedNumber;
                return (
                  <tr
                    key={user.id}
                    data-matched={isMatch ? "true" : undefined}
                    style={isMatch ? { background: "rgba(90, 200, 120, 0.25)", fontWeight: "bold" } : undefined}
                  >
                    <td style={{ padding: 4 }}>{user.paddedNumber}</td>
                    <td style={{ padding: 4 }}>{user.username ?? user.id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
