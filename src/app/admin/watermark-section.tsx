"use client";

import { useEffect, useState } from "react";

type UserOption = {
  id: string;
  username: string | null;
  watermarkNumber: number | null;
};

type RevealResult = {
  preview: string | null;
};

export function WatermarkSection({ users }: { users: UserOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmedDigits = digits.trim();
  const paddedDigits = trimmedDigits.padStart(4, "0");
  const matchedUser =
    trimmedDigits.length > 0
      ? (users.find(
          (user) =>
            user.watermarkNumber !== null &&
            String(user.watermarkNumber).padStart(4, "0") === paddedDigits
        ) ?? null)
      : null;

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
    <section className="admin-panel">
      <h2 className="admin-section-title">Watermark</h2>
      <form onSubmit={handleSubmit}>
        <div className="admin-empty" onPaste={handlePaste} tabIndex={0}>
          {file === null ? (
            <label htmlFor="image">Paste or drop a screenshot, or choose a file:</label>
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
          />
        </div>
        <p>
          <button className="admin-btn" type="submit" disabled={loading || file === null}>
            {loading ? "Enhancing..." : "Enhance"}
          </button>
        </p>
      </form>

      {error !== null && (
        <p>
          <span className="admin-pill admin-pill--danger">{error}</span>
        </p>
      )}

      {result !== null && (
        <div className="admin-stat">
          <span>Chroma isolation</span>
          {result.preview !== null ? (
            /* eslint-disable-next-line @next/next/no-img-element -- data-URL preview with unknown dimensions */
            <img
              className="admin-preview-img"
              src={result.preview}
              alt="Chroma-isolated watermark preview"
            />
          ) : (
            <p>Enhancement failed for this image</p>
          )}
        </div>
      )}

      <div className="admin-toolbar">
        <label htmlFor="digits">UserID</label>
        <input
          id="digits"
          className="admin-input"
          type="text"
          inputMode="numeric"
          value={digits}
          onChange={(e) => setDigits(e.target.value)}
          placeholder="Enter the UserID you see"
        />
        {trimmedDigits.length > 0 ? (
          <span>{matchedUser === null ? "No match" : (matchedUser.username ?? matchedUser.id)}</span>
        ) : null}
      </div>
    </section>
  );
}
