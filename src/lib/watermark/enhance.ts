import sharp from "sharp";

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Gain applied to the Cb/Cr deviation around neutral. Strong enough that the
 * low-alpha red digits saturate to full red while luma stays flat.
 */
const CHROMA_ISOLATION_GAIN = 12;

/**
 * Strip luma and amplify chroma so the red digit overlay pops regardless of
 * the underlying terrain colors: every pixel is flattened to mid-gray luma
 * (BT.601) and its Cb/Cr deviation from neutral is multiplied by
 * CHROMA_ISOLATION_GAIN (clamped).
 */
export async function isolateChromaImage(imageBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels ?? 4;

  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const cb2 = 128 + (cb - 128) * CHROMA_ISOLATION_GAIN;
    const cr2 = 128 + (cr - 128) * CHROMA_ISOLATION_GAIN;
    out[idx] = clampByte(128 + 1.402 * (cr2 - 128));
    out[idx + 1] = clampByte(
      128 - 0.344136 * (cb2 - 128) - 0.714136 * (cr2 - 128)
    );
    out[idx + 2] = clampByte(128 + 1.772 * (cb2 - 128));
  }

  return sharp(out, { raw: { width, height, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}
