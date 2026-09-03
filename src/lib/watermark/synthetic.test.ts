import { describe, expect, it, beforeAll } from "vitest";
import { embedWatermark, type EmbedContext } from "./embed";
import { tryExtractWatermark } from "./extract";
import sharp from "sharp";
import {
  SOFT_CONFIDENCE_THRESHOLD,
  SYNC_SOFT_CONFIDENCE_THRESHOLD,
} from "./config";

beforeAll(() => {
  process.env.WATERMARK_SECRET = "test-watermark-secret-do-not-use-in-prod";
});

describe("watermark embed/extract on synthetic image", () => {
  it("embeds and extracts on a 256×256 gray image", async () => {
    const width = 256;
    const height = 256;
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 3] = 128;
      pixels[i * 3 + 1] = 128;
      pixels[i * 3 + 2] = 128;
    }

    const image = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const context: EmbedContext = {
      mapId: "map-celebration",
      userId: "user-abc",
      watermarkNumber: 1,
      layerId: "layer-terrain",
    };

    const watermarked = await embedWatermark(image, context, { cache: false });

    const result = await tryExtractWatermark(watermarked, {
      mapId: context.mapId,
      layerId: context.layerId,
      originalImageBuffer: image,
      candidates: [
        { userId: context.userId, watermarkNumber: context.watermarkNumber },
        { userId: "user-other", watermarkNumber: 2 },
      ],
    });

    console.log("synthetic result:", result);
    console.log(
      "max diff:",
      watermarked.toString("hex") === image.toString("hex") ? "same" : "different"
    );
    expect(result.found).toBe(true);
    expect(result.userId).toBe(context.userId);
    expect(result.watermarkNumber).toBe(context.watermarkNumber);
    expect(result.confidence).toBeGreaterThan(0.75);
    expect(result.softConfidence).toBeGreaterThan(SOFT_CONFIDENCE_THRESHOLD);
    expect(result.syncSoftConfidence).toBeGreaterThan(SYNC_SOFT_CONFIDENCE_THRESHOLD);
  });
});
