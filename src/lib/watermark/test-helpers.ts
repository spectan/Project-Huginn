import sharp from "sharp";

/**
 * Mean per-pixel chroma deviation from neutral: average of
 * |Cb - 128| + |Cr - 128| (BT.601) over all pixels. Used by the watermark
 * tests to quantify how much chroma signal an image carries.
 */
export async function meanChromaDeviation(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels = info.width * info.height;
  let sum = 0;
  for (let i = 0; i < pixels; i++) {
    const idx = i * channels;
    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    sum += Math.abs(cb - 128) + Math.abs(cr - 128);
  }
  return sum / pixels;
}

/** Deterministic PRNG so the synthetic test images are stable run to run. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mean signed "red chroma" signal: average of (Cr - 128) - (Cb - 128)
 * (BT.601) over all pixels. The watermark digits are pure red (Cr up, Cb
 * down), so they push this metric consistently positive, while arbitrary
 * terrain hues push it in random directions that cancel out. Unlike the
 * absolute-deviation metric above, this survives the clamping that strong
 * chroma amplification applies to already-colorful terrain.
 */
export async function meanRedChromaSignal(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels = info.width * info.height;
  let sum = 0;
  for (let i = 0; i < pixels; i++) {
    const idx = i * channels;
    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    sum += cr - cb;
  }
  return sum / pixels;
}
