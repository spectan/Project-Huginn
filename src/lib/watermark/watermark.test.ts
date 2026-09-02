import { describe, expect, it, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { embedWatermark, type EmbedContext } from "./embed";
import { extractWatermark } from "./extract";
import { forwardDCT2D, inverseDCT2D } from "./dct";
import { encodePayload, decodePayloadBits } from "./codec";

// These tests depend on WATERMARK_SECRET being set. We set a deterministic
// dev secret for the test process.
beforeAll(() => {
  process.env.WATERMARK_SECRET = "test-watermark-secret-do-not-use-in-prod";
});

describe("DCT round-trip", () => {
  it("inverts an 8×8 block within a small tolerance", () => {
    const block = new Float64Array(64);
    for (let i = 0; i < 64; i++) {
      block[i] = Math.sin(i) * 100 + 128;
    }

    const dct = forwardDCT2D(block);
    const restored = inverseDCT2D(dct);

    let maxDiff = 0;
    for (let i = 0; i < 64; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(block[i]! - restored[i]!));
    }

    expect(maxDiff).toBeLessThan(1e-9);
  });
});

describe("payload codec", () => {
  it("round-trips a username and datestamp", () => {
    const payload = { username: "spectan", datestamp: "2026-09-02" };
    const context = { mapId: "map-celebration", userId: "user-123" };

    const { bits } = encodePayload(payload, context);
    const decoded = decodePayloadBits(bits);

    expect(decoded.payload.username).toBe(payload.username);
    expect(decoded.payload.datestamp).toBe(payload.datestamp);
    expect(decoded.checksumValid).toBe(true);
  });
});

describe("watermark embed/extract", () => {
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");

  it("embeds and extracts a watermark on the celebration terrain map", async () => {
    if (!existsSync(samplePath)) {
      // Skip if running in an environment without the sample maps.
      return;
    }

    const payload = { username: "spectan", datestamp: "2026-09-02" };
    const context: EmbedContext = {
      mapId: "map-celebration",
      userId: "user-abc",
      layerId: "layer-terrain",
    };

    const watermarked = await embedWatermark(samplePath, payload, context, {
      cache: false,
    });

    expect(watermarked.length).toBeGreaterThan(0);

    const result = await extractWatermark(watermarked, {
      mapId: context.mapId,
      userId: context.userId,
      datestamp: payload.datestamp,
    });

    console.log("extract result:", result);
    expect(result.found).toBe(true);
    expect(result.payload).toEqual(payload);
    expect(result.checksumValid).toBe(true);
  });
});
