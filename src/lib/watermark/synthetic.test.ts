import { describe, expect, it, beforeAll } from "vitest";
import { embedWatermark, type EmbedContext } from "./embed";
import { extractWatermark } from "./extract";
import sharp from "sharp";

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

    const payload = { username: "spectan", datestamp: "2026-09-02" };
    const context: EmbedContext = {
      mapId: "map-celebration",
      userId: "user-abc",
      layerId: "layer-terrain",
    };

    const watermarked = await embedWatermark(
      image,
      payload,
      context,
      { cache: false }
    );

    const result = await extractWatermark(watermarked, {
      mapId: context.mapId,
      userId: context.userId,
      datestamp: payload.datestamp,
    });

    console.log("synthetic result:", result);
    console.log("max diff:", (watermarked.toString('hex') === image.toString('hex')) ? 'same' : 'different');
    expect(result.found).toBe(true);
    expect(result.payload).toEqual(payload);
    expect(result.checksumValid).toBe(true);
  });
});
