import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { embedWatermark, type EmbedContext } from "./embed";
import { isolateChromaImage } from "./enhance";
import { meanRedChromaSignal, mulberry32 } from "./test-helpers";

/**
 * Robustness of the digit overlay against the ways a screenshot degrades:
 * browser-zoom resampling, arbitrary crops, and JPEG re-encoding.
 *
 * The metric is differential: the same synthetic base image is pushed through
 * the exact same degradation pipeline with and without the watermark, and the
 * signed red-chroma signal of the two chroma-isolated results is compared.
 * Terrain color, JPEG artifacts, and resampling noise contribute equally to
 * both sides, so the remaining difference is the digit signal. The signed
 * metric is used instead of absolute deviation because the strong isolation
 * gain clamps already-colorful terrain, which drowns any absolute-deviation
 * difference; the red digits push Cr up and Cb down in one consistent
 * direction that survives the clamping.
 */

const BASE_SIZE = 1024;

const context: EmbedContext = {
  mapId: "test-map",
  layerId: "test-map:default",
  userId: "user-42",
  watermarkNumber: 42,
};

/**
 * Realistic-ish terrain stand-in: smooth muted color blobs (gentle chroma),
 * per-pixel luma noise, and a diagonal brightness gradient.
 */
async function makeBaseImage(size = BASE_SIZE): Promise<Buffer> {
  const rand = mulberry32(1337);
  const blobSize = 32;
  const blobSeed = Buffer.alloc(blobSize * blobSize * 3);
  for (let i = 0; i < blobSeed.length; i++) {
    blobSeed[i] = Math.floor(rand() * 256);
  }
  const { data: blobs } = await sharp(blobSeed, {
    raw: { width: blobSize, height: blobSize, channels: 3 },
  })
    .resize(size, size, { kernel: "cubic" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      const r = blobs[idx]!;
      const g = blobs[idx + 1]!;
      const b = blobs[idx + 2]!;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumaNoise = (rand() - 0.5) * 60;
      const gradient = (x / size) * 40 + (y / size) * 30 - 35;
      out[idx] = clamp(luma + (r - luma) * 0.1 + lumaNoise + gradient);
      out[idx + 1] = clamp(luma + (g - luma) * 0.1 + lumaNoise + gradient);
      out[idx + 2] = clamp(luma + (b - luma) * 0.1 + lumaNoise + gradient);
    }
  }
  return sharp(out, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

type Degrade = (png: Buffer) => Promise<Buffer>;

function resizeBy(factor: number): Degrade {
  return async (png) => {
    const meta = await sharp(png).metadata();
    const width = Math.max(1, Math.round((meta.width ?? 1) * factor));
    const height = Math.max(1, Math.round((meta.height ?? 1) * factor));
    return sharp(png).resize(width, height).png().toBuffer();
  };
}

function crop(
  left: number,
  top: number,
  width: number,
  height: number
): Degrade {
  return (png) =>
    sharp(png).extract({ left, top, width, height }).png().toBuffer();
}

function jpeg(quality: number): Degrade {
  return (png) => sharp(png).jpeg({ quality }).toBuffer();
}

const cropRand = mulberry32(7);
const crop800 = {
  left: Math.floor(cropRand() * (BASE_SIZE - 800)),
  top: Math.floor(cropRand() * (BASE_SIZE - 600)),
};
const crop400 = {
  left: Math.floor(cropRand() * (BASE_SIZE - 400)),
  top: Math.floor(cropRand() * (BASE_SIZE - 300)),
};

const scenarios: Array<{ name: string; degrade: Degrade }> = [
  // Browser zoom: 200% upscale down to 25% (4:1 zoom-out).
  { name: "zoom 200%", degrade: resizeBy(2) },
  { name: "zoom 150%", degrade: resizeBy(1.5) },
  { name: "zoom 100%", degrade: resizeBy(1) },
  { name: "zoom 75%", degrade: resizeBy(0.75) },
  { name: "zoom 67%", degrade: resizeBy(2 / 3) },
  { name: "zoom 50%", degrade: resizeBy(0.5) },
  { name: "zoom 33%", degrade: resizeBy(1 / 3) },
  { name: "zoom 25%", degrade: resizeBy(0.25) },
  { name: "crop 800x600", degrade: crop(crop800.left, crop800.top, 800, 600) },
  { name: "crop 400x300", degrade: crop(crop400.left, crop400.top, 400, 300) },
  { name: "jpeg q85", degrade: jpeg(85) },
  { name: "jpeg q70", degrade: jpeg(70) },
  {
    name: "worst case: 50% zoom + jpeg q70 + 400x300 crop",
    degrade: async (png) => {
      const shrunk = await resizeBy(0.5)(png);
      const encoded = await jpeg(70)(shrunk);
      return crop(37, 91, 400, 300)(encoded);
    },
  },
];

// Minimum margin of chroma-isolated red-chroma signal the watermarked image
// must keep over the identically processed unmarked control. Tuned against
// the scenarios above: the worst measured margin (400x300 crop, ≈ 5.1) is
// about 2x this bound.
const SIGNAL_MARGIN = 2.5;

describe("digit watermark robustness", () => {
  let base: Buffer;
  let embedded: Buffer;

  it(
    "survives zoom, crops, and JPEG re-encoding",
    { timeout: 120_000 },
    async () => {
      base = await makeBaseImage();
      embedded = await embedWatermark(base, context, { cache: false });

      for (const scenario of scenarios) {
        const signal = await meanRedChromaSignal(
          await isolateChromaImage(await scenario.degrade(embedded))
        );
        const control = await meanRedChromaSignal(
          await isolateChromaImage(await scenario.degrade(base))
        );
        expect(
          signal,
          `${scenario.name}: signal ${signal.toFixed(2)} vs control ${control.toFixed(2)}`
        ).toBeGreaterThan(control + SIGNAL_MARGIN);
      }
    }
  );
});
