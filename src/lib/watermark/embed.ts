import { mkdir, readFile } from "fs/promises";
import { createHash } from "crypto";
import { dirname, join } from "path";
import sharp from "sharp";
import {
  BLOCK_SIZE,
  CHROMA_DELTA,
  assertSecret,
  buildCacheKey,
  getWatermarkCacheDir,
} from "./config";
import { getBlockChip } from "./codec";

function hashInput(input: string | Buffer): Promise<string> {
  const hash = createHash("sha256");
  if (Buffer.isBuffer(input)) {
    hash.update(input);
    return Promise.resolve(hash.digest("hex"));
  }
  return new Promise(async (resolve, reject) => {
    const { createReadStream } = await import("fs");
    const stream = createReadStream(input);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// BT.601 luma/chroma round-trip. The watermark only moves Cb/Cr; Y is
// preserved exactly, so no brightness change is introduced.
function rgbToChroma(
  r: number,
  g: number,
  b: number
): { y: number; cb: number; cr: number } {
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

function chromaToRgb(
  y: number,
  cb: number,
  cr: number
): { r: number; g: number; b: number } {
  return {
    r: y + 1.402 * (cr - 128),
    g: y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128),
    b: y + 1.772 * (cb - 128),
  };
}

export interface EmbedContext {
  layerId: string;
  mapId: string;
  userId: string;
  watermarkNumber: number;
}

export interface EmbedOptions {
  cache?: boolean;
}

/**
 * Embed a per-user chroma watermark into a map layer PNG.
 *
 * Each 16×16 block shifts the Cb and Cr channels by a tiny amount derived
 * deterministically from the secret, map, layer, user, and block
 * coordinates. Luma is untouched: the pattern is invisible at normal
 * viewing and only appears when saturation is boosted.
 */
export async function embedWatermark(
  imageInput: string | Buffer,
  context: EmbedContext,
  options: EmbedOptions = {}
): Promise<Buffer> {
  assertSecret();

  const { cache = true } = options;
  const cacheDir = getWatermarkCacheDir();
  const imageHash = await hashInput(imageInput);
  const cacheKey = buildCacheKey(imageHash, context.userId, context.layerId);
  const cachePath = join(cacheDir, cacheKey + ".png");

  if (cache) {
    try {
      const cached = await readFile(cachePath);
      return cached;
    } catch {
      // cache miss, continue
    }
  }

  // Read original metadata first to preserve the source channel count, then
  // load with alpha for processing.
  const meta = await sharp(imageInput).metadata();
  const rawChannels = meta.channels ?? 3;

  const { data, info } = await sharp(imageInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixelCount = width * height;

  // Work in the 4-channel RGBA buffer, then copy the desired channels out.
  const rgba = Buffer.from(data);

  const blocksW = Math.ceil(width / BLOCK_SIZE);
  const blocksH = Math.ceil(height / BLOCK_SIZE);

  for (let by = 0; by < blocksH; by++) {
    for (let bx = 0; bx < blocksW; bx++) {
      const chip = getBlockChip(context, bx, by);
      const delta = chip * CHROMA_DELTA;

      const yStart = by * BLOCK_SIZE;
      const yEnd = Math.min(yStart + BLOCK_SIZE, height);
      const xStart = bx * BLOCK_SIZE;
      const xEnd = Math.min(xStart + BLOCK_SIZE, width);

      for (let y = yStart; y < yEnd; y++) {
        const row = y * width;
        for (let x = xStart; x < xEnd; x++) {
          const idx = (row + x) * 4;
          const { y: lum, cb, cr } = rgbToChroma(
            rgba[idx]!,
            rgba[idx + 1]!,
            rgba[idx + 2]!
          );
          const { r, g, b } = chromaToRgb(lum, cb + delta, cr + delta);
          rgba[idx] = clampByte(r);
          rgba[idx + 1] = clampByte(g);
          rgba[idx + 2] = clampByte(b);
        }
      }
    }
  }

  // Preserve the source channel count so RGB images stay RGB.
  const output = Buffer.alloc(pixelCount * rawChannels);
  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * rawChannels;
    output[dst] = rgba[src]!;
    output[dst + 1] = rgba[src + 1]!;
    output[dst + 2] = rgba[src + 2]!;
    if (rawChannels === 4) {
      output[dst + 3] = rgba[src + 3]!;
    }
  }

  const png = await sharp(output, {
    raw: { width, height, channels: rawChannels },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  if (cache) {
    await mkdir(dirname(cachePath), { recursive: true });
    const { writeFile } = await import("fs/promises");
    await writeFile(cachePath, png);
  }

  return png;
}
