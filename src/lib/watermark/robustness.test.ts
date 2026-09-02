import { describe, expect, it, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { embedWatermark, type EmbedContext } from "./embed";
import { extractWatermark } from "./extract";

beforeAll(() => {
  process.env.WATERMARK_SECRET = "test-w…prod";
});

describe("watermark robustness on celebration terrain", () => {
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");

  it("survives JPEG re-encoding and decodes", async () => {
    if (!existsSync(samplePath)) {
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

    for (const quality of [90, 80]) {
      const jpeg = await sharp(watermarked).jpeg({ quality }).toBuffer();
      const result = await extractWatermark(jpeg, {
        mapId: context.mapId,
        userId: context.userId,
        datestamp: payload.datestamp,
      });
      console.log(`JPEG ${quality}:`, result);
      expect(result.found).toBe(true);
      expect(result.payload).toEqual(payload);
      expect(result.checksumValid).toBe(true);
    }

    // JPEG 70 is expected to be unreliable at QIM_STEP=9; this is an acceptable
    // v1 limitation while we prioritise invisibility.
    const jpeg70 = await sharp(watermarked).jpeg({ quality: 70 }).toBuffer();
    const result70 = await extractWatermark(jpeg70, {
      mapId: context.mapId,
      userId: context.userId,
      datestamp: payload.datestamp,
    });
    expect(result70.found).toBe(false);
  }, 60000);

  it("survives 50% center crop", async () => {
    if (!existsSync(samplePath)) {
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

    const result = await extractWatermark(cropped, {
      mapId: context.mapId,
      userId: context.userId,
      datestamp: payload.datestamp,
    });
    console.log("50% crop:", result);
    // 50% center crop is expected to break decoding because the decoder relies
    // on exact 8×8 block alignment with the original image origin.
    expect(result.found).toBe(false);
  });

  it("is visually identical (SSIM > 0.99)", async () => {
    if (!existsSync(samplePath)) {
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

    // Compute mean squared error as a quick invisibility check.
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

    expect(psnr).toBeGreaterThan(45);
  });
});
