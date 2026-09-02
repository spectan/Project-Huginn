import sharp from "sharp";
import {
  BLOCK_SIZE,
  COEFFS_PER_BLOCK,
  MIDFREQ_INDICES,
  PAYLOAD_BITS,
  SS_ALPHA,
  SYNC_LENGTH,
  SYNC_PATTERN,
  TOTAL_BITS,
  assertSecret,
} from "./config";
import { forwardDCT2D } from "./dct";
import { getEmbeddedBitStream } from "./codec";

export interface ExtractContext {
  mapId: string;
  userId: string;
}

export interface ExtractResult {
  found: boolean;
  userId: string | null;
  confidence: number;
  syncConfidence: number;
  offsetX: number;
  offsetY: number;
}

interface ImageBlocks {
  width: number;
  height: number;
  blocksW: number;
  blocksH: number;
  luma: Float64Array;
}

async function loadImageLuma(imageBuffer: Buffer): Promise<ImageBlocks> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels ?? 4;
  const pixelCount = width * height;
  const luma = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    luma[i] =
      0.299 * data[i * channels]! +
      0.587 * data[i * channels + 1]! +
      0.114 * data[i * channels + 2]!;
  }

  const blocksW = Math.floor(width / BLOCK_SIZE);
  const blocksH = Math.floor(height / BLOCK_SIZE);
  return { width, height, blocksW, blocksH, luma };
}

function getBlock(
  luma: Float64Array,
  width: number,
  bx: number,
  by: number
): Float64Array {
  const block = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  for (let y = 0; y < BLOCK_SIZE; y++) {
    const srcY = by * BLOCK_SIZE + y;
    for (let x = 0; x < BLOCK_SIZE; x++) {
      const srcX = bx * BLOCK_SIZE + x;
      block[y * BLOCK_SIZE + x] = luma[srcY * width + srcX]!;
    }
  }
  return block;
}

/**
 * Extract the watermark from a single candidate at a specific pixel offset.
 *
 * The offset is used when the screenshot is not block-aligned with the
 * original image. For offset=0 we use the image's block grid directly; for
 * other offsets we shift the luma buffer and recompute the DCTs.
 */
function extractAtOffset(
  image: ImageBlocks,
  bitStream: (0 | 1)[],
  offsetX: number,
  offsetY: number
): {
  syncConfidence: number;
  confidence: number;
  bits: (0 | 1)[];
} {
  const { width, height, blocksW, blocksH, luma } = image;

  // Build a shifted luma view for non-zero offsets.
  const shiftedLuma = new Float64Array(width * height);
  if (offsetX === 0 && offsetY === 0) {
    luma.forEach((v, i) => (shiftedLuma[i] = v));
  } else {
    shiftedLuma.fill(128);
    for (let y = 0; y < height - offsetY; y++) {
      for (let x = 0; x < width - offsetX; x++) {
        shiftedLuma[y * width + x] = luma[(y + offsetY) * width + (x + offsetX)]!;
      }
    }
  }

  const blockCount = blocksW * blocksH;
  const correlations = new Float64Array(TOTAL_BITS);
  const counts = new Int32Array(TOTAL_BITS);

  const blockBuffer = new Float64Array(64);

  for (let b = 0; b < blockCount; b++) {
    const bx = b % blocksW;
    const by = Math.floor(b / blocksW);
    const block = getBlock(shiftedLuma, width, bx, by);
    const dct = forwardDCT2D(block);
    const bitIndex = b % TOTAL_BITS;

    for (let k = 0; k < COEFFS_PER_BLOCK; k++) {
      const coeffSlot = (b * COEFFS_PER_BLOCK + k) % MIDFREQ_INDICES.length;
      const coeffIndex = MIDFREQ_INDICES[coeffSlot]!;
      correlations[bitIndex]! += dct[coeffIndex]!;
      counts[bitIndex]!++;
    }
  }

  const bits: (0 | 1)[] = [];
  for (let i = 0; i < TOTAL_BITS; i++) {
    const avg = counts[i]! > 0 ? correlations[i]! / counts[i]! : 0;
    bits.push(avg > 0 ? 1 : 0);
  }

  let syncMatches = 0;
  for (let i = 0; i < SYNC_LENGTH; i++) {
    if (bits[i] === SYNC_PATTERN[i]) syncMatches++;
  }
  const syncConfidence = syncMatches / SYNC_LENGTH;

  let payloadMatches = 0;
  for (let i = SYNC_LENGTH; i < TOTAL_BITS; i++) {
    if (bits[i] === bitStream[i]) payloadMatches++;
  }
  const confidence = (syncMatches + payloadMatches) / TOTAL_BITS;

  return { syncConfidence, confidence, bits };
}

/**
 * Find the best pixel offset by looking at the known sync pattern.
 *
 * We try all 64 offsets within one block and pick the one with the highest
 * sync confidence. This handles screenshots that are not aligned to the 8×8
 * block grid.
 */
function findBestOffset(
  image: ImageBlocks,
  referenceBitStream: (0 | 1)[]
): { offsetX: number; offsetY: number; confidence: number } {
  let bestOffsetX = 0;
  let bestOffsetY = 0;
  let bestConfidence = -1;

  for (let oy = 0; oy < BLOCK_SIZE; oy++) {
    for (let ox = 0; ox < BLOCK_SIZE; ox++) {
      const { syncConfidence } = extractAtOffset(
        image,
        referenceBitStream,
        ox,
        oy
      );
      if (syncConfidence > bestConfidence) {
        bestConfidence = syncConfidence;
        bestOffsetX = ox;
        bestOffsetY = oy;
      }
    }
  }

  return { offsetX: bestOffsetX, offsetY: bestOffsetY, confidence: bestConfidence };
}

export async function extractWatermark(
  imageBuffer: Buffer,
  context: ExtractContext
): Promise<ExtractResult> {
  assertSecret();

  const image = await loadImageLuma(imageBuffer);
  const bitStream = getEmbeddedBitStream(context.mapId, context.userId);
  const { offsetX, offsetY, confidence } = findBestOffset(image, bitStream);

  const threshold = 0.75;
  if (confidence < threshold) {
    return {
      found: false,
      userId: null,
      confidence,
      syncConfidence: confidence,
      offsetX,
      offsetY,
    };
  }

  return {
    found: true,
    userId: context.userId,
    confidence,
    syncConfidence: confidence,
    offsetX,
    offsetY,
  };
}

export async function tryExtractWatermark(
  imageBuffer: Buffer,
  context: { mapId: string; userIds: string[] }
): Promise<ExtractResult> {
  assertSecret();
  if (context.userIds.length === 0) {
    return {
      found: false,
      userId: null,
      confidence: 0,
      syncConfidence: 0,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const image = await loadImageLuma(imageBuffer);

  // Use the first candidate as a reference to find the best offset via sync.
  const referenceBitStream = getEmbeddedBitStream(
    context.mapId,
    context.userIds[0]!
  );
  const { offsetX, offsetY } = findBestOffset(image, referenceBitStream);

  let best: ExtractResult = {
    found: false,
    userId: null,
    confidence: 0,
    syncConfidence: 0,
    offsetX,
    offsetY,
  };

  for (const userId of context.userIds) {
    const bitStream = getEmbeddedBitStream(context.mapId, userId);
    const { syncConfidence, confidence } = extractAtOffset(
      image,
      bitStream,
      offsetX,
      offsetY
    );

    if (confidence > best.confidence) {
      best = {
        found: confidence >= 0.75,
        userId,
        confidence,
        syncConfidence,
        offsetX,
        offsetY,
      };
    }
  }

  return best;
}
