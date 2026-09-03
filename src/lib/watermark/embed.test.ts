import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { OVERLAY_ALPHA } from "./config";
import { embedWatermark, type EmbedContext } from "./embed";
import { isolateChromaImage } from "./enhance";
import { meanChromaDeviation } from "./test-helpers";

const SIZE = 512;

const context: EmbedContext = {
  mapId: "test-map",
  layerId: "test-map:default",
  userId: "user-1",
  watermarkNumber: 42,
};

function midGrayImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

describe("embedWatermark", () => {
  it("is invisible: per-pixel channel delta stays within the overlay alpha", async () => {
    const original = await midGrayImage();
    const embedded = await embedWatermark(original, context, { cache: false });

    const before = await sharp(original).raw().toBuffer();
    const after = await sharp(embedded).raw().toBuffer();
    expect(after.length).toBe(before.length);

    let maxDelta = 0;
    for (let i = 0; i < before.length; i++) {
      const delta = Math.abs(after[i]! - before[i]!);
      if (delta > maxDelta) maxDelta = delta;
    }
    expect(maxDelta).toBeLessThanOrEqual(OVERLAY_ALPHA + 1);
  });

  it("carries a chroma signal that chroma isolation reveals", async () => {
    const original = await midGrayImage();
    const embedded = await embedWatermark(original, context, { cache: false });

    const signal = await meanChromaDeviation(await isolateChromaImage(embedded));
    const control = await meanChromaDeviation(await isolateChromaImage(original));

    // The flat-gray control has no chroma at all; the digits must contribute
    // a clearly measurable mean deviation.
    expect(control).toBeLessThan(1);
    expect(signal).toBeGreaterThan(5);
    expect(signal).toBeGreaterThan(control + 5);
  });
});
