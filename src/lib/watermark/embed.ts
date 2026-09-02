import { mkdir, readFile } from "fs/promises";
import { createHash } from "crypto";
import { dirname, join } from "path";
import sharp from "sharp";
import {
  BLOCK_SIZE,
  COEFFS_PER_BLOCK,
  MIDFREQ_INDICES,
  SS_ALPHA,
  TOTAL_BITS,
  assertSecret,
  buildCacheKey,
  getWatermarkCacheDir,
} from "./config";
import { forwardDCT2D, inverseDCT2D } from "./dct";
import { getEmbeddedBitStream } from "./codec";

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
  mapId: string;
  userId: string;
  layerId: string;
}

export interface EmbedOptions {
  cache?: boolean;
}

/**
 * Embed a spread-spectrum watermark into a map layer PNG.
 *
 * The payload is a fixed sync pattern plus a 16-bit hash of (mapId, userId).
 * Each bit is spread across many 8×8 DCT blocks with interleaved assignment
 * so that cropping only removes a fraction of each bit's samples.
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

  const { data, info } = await sharp(imageInput)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const channels = info.channels ?? 4;
  const pixelCount = width * height;

  const originalLuma = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    originalLuma[i] =
      0.299 * data[i * channels]! +
      0.587 * data[i * channels + 1]! +
      0.114 * data[i * channels + 2]!;
  }

  const paddedW = Math.ceil(width / BLOCK_SIZE) * BLOCK_SIZE;
  const paddedH = Math.ceil(height / BLOCK_SIZE) * BLOCK_SIZE;
  const blocksW = paddedW / BLOCK_SIZE;
  const blocksH = paddedH / BLOCK_SIZE;
  const totalBlocks = blocksW * blocksH;

  const bitStream = getEmbeddedBitStream(context.mapId, context.userId);

  const modifiedLuma = new Float64Array(pixelCount);
  originalLuma.forEach((v, i) => (modifiedLuma[i] = v));

  const blockBuffer = new Float64Array(64);

  for (let b = 0; b < totalBlocks; b++) {
    const bx = b % blocksW;
    const by = Math.floor(b / blocksW);

    for (let y = 0; y < BLOCK_SIZE; y++) {
      const srcY = by * BLOCK_SIZE + y;
      for (let x = 0; x < BLOCK_SIZE; x++) {
        const srcX = bx * BLOCK_SIZE + x;
        const idx = srcY * width + srcX;
        blockBuffer[y * BLOCK_SIZE + x] =
          srcX < width && srcY < height ? originalLuma[idx]! : 128;
      }
    }

    const dct = forwardDCT2D(blockBuffer);
    const bitIndex = b % TOTAL_BITS;
    const bit = bitStream[bitIndex]!;
    const sign = bit === 1 ? 1 : -1;

    for (let k = 0; k < COEFFS_PER_BLOCK; k++) {
      const coeffSlot = (b * COEFFS_PER_BLOCK + k) % MIDFREQ_INDICES.length;
      const coeffIndex = MIDFREQ_INDICES[coeffSlot]!;
      dct[coeffIndex] = dct[coeffIndex]! + sign * SS_ALPHA;
    }

    const modifiedBlock = inverseDCT2D(dct);

    for (let y = 0; y < BLOCK_SIZE; y++) {
      const dstY = by * BLOCK_SIZE + y;
      if (dstY >= height) continue;
      for (let x = 0; x < BLOCK_SIZE; x++) {
        const dstX = bx * BLOCK_SIZE + x;
        if (dstX >= width) continue;
        const idx = dstY * width + dstX;
        modifiedLuma[idx] = modifiedBlock[y * BLOCK_SIZE + x]!;
      }
    }
  }

  const output = Buffer.alloc(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const delta = modifiedLuma[i]! - originalLuma[i]!;
    output[i * 3] = clampByte(data[i * channels]! + delta);
    output[i * 3 + 1] = clampByte(data[i * channels + 1]! + delta);
    output[i * 3 + 2] = clampByte(data[i * channels + 2]! + delta);
  }

  const png = await sharp(output, {
    raw: { width, height, channels: 3 },
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
