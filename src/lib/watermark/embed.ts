import { mkdir, readFile } from "fs/promises";
import { createHash } from "crypto";
import { dirname, join } from "path";
import sharp from "sharp";
import {
  BLOCK_SIZE,
  DITHER_DELTA,
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
 * Embed a per-user spatial color-dither watermark into a map layer PNG.
 *
 * Each 16×16 block is brightened or darkened by a tiny luma shift derived
 * deterministically from the secret, map, layer, user, and block coordinates.
 * The shift is applied equally to R, G, and B so hue is preserved.
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
      const delta = chip * DITHER_DELTA;

      const yStart = by * BLOCK_SIZE;
      const yEnd = Math.min(yStart + BLOCK_SIZE, height);
      const xStart = bx * BLOCK_SIZE;
      const xEnd = Math.min(xStart + BLOCK_SIZE, width);

      for (let y = yStart; y < yEnd; y++) {
        const row = y * width;
        for (let x = xStart; x < xEnd; x++) {
          const idx = (row + x) * 4;
          rgba[idx] = clampByte(rgba[idx]! + delta);
          rgba[idx + 1] = clampByte(rgba[idx + 1]! + delta);
          rgba[idx + 2] = clampByte(rgba[idx + 2]! + delta);
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
