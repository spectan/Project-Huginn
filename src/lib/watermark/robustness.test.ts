import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { embedWatermark, type EmbedContext } from "./embed";
import { tryExtractWatermark } from "./extract";
import {
  SOFT_CONFIDENCE_THRESHOLD,
  SYNC_SOFT_CONFIDENCE_THRESHOLD,
} from "./config";

beforeAll(() => {
  process.env.WATERMARK_SECRET = "test-watermark-secret-do-not-use-in-prod";
});

const CONFIDENCE_THRESHOLD = 0.6;

const candidates = [
  { userId: "user-abc", watermarkNumber: 1 },
  { userId: "user-other", watermarkNumber: 2 },
];

function candidateFor(userId: string) {
  return candidates.find((c) => c.userId === userId) ?? candidates[0]!;
}

describe("watermark robustness on celebration terrain", () => {
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");

  it(
    "full-resolution PNG round-trips with high confidence",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const result = await tryExtractWatermark(watermarked, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("raw PNG:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    60000
  );

  it(
    "decodes after JPEG re-encoding at quality 80 and 90",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      for (const quality of [90, 80]) {
        const jpeg = await sharp(watermarked).jpeg({ quality }).toBuffer();
        const result = await tryExtractWatermark(jpeg, {
          mapId: context.mapId,
          layerId: context.layerId,
          originalImageBuffer: originalBuffer,
          candidates: [candidateFor("user-abc")],
        });
        console.log(`JPEG ${quality}:`, result);
        expect(result.found).toBe(true);
        expect(result.userId).toBe(context.userId);
        expect(result.watermarkNumber).toBe(context.watermarkNumber);
        expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
        expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
        expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
      }
    },
    120000
  );

  it(
    "decodes after a 50% center crop",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const { width, height } = await sharp(watermarked).metadata();
      if (!width || !height) {
        throw new Error("Could not read watermarked dimensions");
      }

      const cropWidth = Math.floor(width * 0.5);
      const cropHeight = Math.floor(height * 0.5);
      const left = Math.floor((width - cropWidth) / 2);
      const top = Math.floor((height - cropHeight) / 2);

      const cropped = await sharp(watermarked)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();

      const result = await tryExtractWatermark(cropped, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("50% crop:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    60000
  );

  it(
    "decodes after a 25% center crop",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const { width, height } = await sharp(watermarked).metadata();
      if (!width || !height) {
        throw new Error("Could not read watermarked dimensions");
      }

      const cropWidth = Math.floor(width * 0.25);
      const cropHeight = Math.floor(height * 0.25);
      const left = Math.floor((width - cropWidth) / 2);
      const top = Math.floor((height - cropHeight) / 2);

      const cropped = await sharp(watermarked)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();

      const result = await tryExtractWatermark(cropped, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("25% crop:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    60000
  );

  it(
    "decodes after a non-aligned crop",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const { width, height } = await sharp(watermarked).metadata();
      if (!width || !height) {
        throw new Error("Could not read watermarked dimensions");
      }

      const cropWidth = Math.floor(width * 0.5);
      const cropHeight = Math.floor(height * 0.5);
      const offsetX = 3;
      const offsetY = 5;
      const left = Math.min(offsetX, width - cropWidth);
      const top = Math.min(offsetY, height - cropHeight);

      const cropped = await sharp(watermarked)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();

      const result = await tryExtractWatermark(cropped, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("non-aligned crop:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    60000
  );

  it(
    "decodes after 50% uniform downscale (simulated zoomed-out screenshot)",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const scaled = await sharp(watermarked)
        .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

      const result = await tryExtractWatermark(scaled, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("50% downscale:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    120000
  );

  it(
    "decodes after 25% uniform downscale (simulated zoomed-out screenshot)",
    async () => {
      if (!existsSync(samplePath)) {
        return;
      }

      const originalBuffer = readFileSync(samplePath);

      const context: EmbedContext = {
        mapId: "map-celebration",
        userId: "user-abc",
        watermarkNumber: candidateFor("user-abc").watermarkNumber,
        layerId: "layer-terrain",
      };

      const watermarked = await embedWatermark(samplePath, context, {
        cache: false,
      });

      const scaled = await sharp(watermarked)
        .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

      const result = await tryExtractWatermark(scaled, {
        mapId: context.mapId,
        layerId: context.layerId,
        originalImageBuffer: originalBuffer,
        candidates,
      });
      console.log("25% downscale:", result);

      expect(result.found).toBe(true);
      expect(result.userId).toBe(context.userId);
      expect(result.watermarkNumber).toBe(context.watermarkNumber);
      expect(result.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD);
      expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
      expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
    },
    120000
  );

  it("is visually imperceptible (PSNR > 38)", async () => {
    if (!existsSync(samplePath)) {
      return;
    }

    const context: EmbedContext = {
      mapId: "map-celebration",
      userId: "user-abc",
      watermarkNumber: candidateFor("user-abc").watermarkNumber,
      layerId: "layer-terrain",
    };

    const watermarked = await embedWatermark(samplePath, context, {
      cache: false,
    });

    const originalBuffer = await sharp(samplePath).raw().toBuffer();
    const watermarkedBuffer = await sharp(watermarked).raw().toBuffer();

    let sumSquaredDiff = 0;
    let count = 0;
    for (let i = 0; i < originalBuffer.length; i++) {
      const diff = originalBuffer[i]! - watermarkedBuffer[i]!;
      sumSquaredDiff += diff * diff;
      count++;
    }
    const mse = sumSquaredDiff / count;
    const psnr = 10 * Math.log10((255 * 255) / mse);
    console.log("MSE:", mse, "PSNR:", psnr);

    expect(psnr).toBeGreaterThan(38);
  });
});
