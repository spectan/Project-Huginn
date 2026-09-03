import { describe, expect, it, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { embedWatermark, type EmbedContext } from "./embed";
import { tryExtractWatermark } from "./extract";
import { forwardDCT2D, inverseDCT2D } from "./dct";
import {
  SOFT_CONFIDENCE_THRESHOLD,
  SYNC_SOFT_CONFIDENCE_THRESHOLD,
} from "./config";

// These tests depend on WATERMARK_SECRET being set. We set a deterministic
// dev secret for the test process.
beforeAll(() => {
  process.env.WATERMARK_SECRET = "test-w…prod";
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

describe("watermark embed/extract", () => {
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");

  it(
    "embeds and extracts a watermark on the celebration terrain map",
    async () => {
      if (!existsSync(samplePath)) {
        // Skip if running in an environment without the sample maps.
        return;
      }

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: 1,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      expect(watermarked.length).toBeGreaterThan(0);

      const result = await tryExtractWatermark(watermarked, {
        mapId: context.mapId,
        candidates: [
          { userId: context.userId, watermarkNumber: context.watermarkNumber },
          { userId: "user-other", watermarkNumber: 2 },
        ],
      });

      console.log("extract result:", result);
      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(0.75);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    60000
  );
});
