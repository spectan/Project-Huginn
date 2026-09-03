import sharp from "sharp";
import {
  ALIGNMENT_SAMPLE_BLOCKS,
  BLOCK_SIZE,
  COEFFS_PER_BLOCK,
  CONFIDENCE_MARGIN,
  EXTRACT_SCALE_FACTORS,
  MAX_ALIGNMENT_DIMENSION,
  MIDFREQ_INDICES,
  SOFT_CONFIDENCE_THRESHOLD,
  SYNC_CONFIDENCE_THRESHOLD,
  SYNC_LENGTH,
  SYNC_PATTERN,
  SYNC_SOFT_CONFIDENCE_THRESHOLD,
  TOTAL_BITS,
  assertSecret,
} from "./config";
import { forwardDCT2D } from "./dct";
import { getEmbeddedBitStream } from "./codec";

export interface ExtractContext {
  mapId: string;
  userId: string;
  watermarkNumber: number;
}

export interface ExtractResult {
  found: boolean;
  userId: string | null;
  watermarkNumber: number | null;
  confidence: number;
  syncConfidence: number;
  softConfidence: number;
  syncSoftConfidence: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface ImageBlocks {
  width: number;
  height: number;
  blocksW: number;
  blocksH: number;
  luma: Float64Array;
}

async function loadImageLuma(
  imageBuffer: Buffer,
  scale = 1
): Promise<ImageBlocks> {
  let pipeline = sharp(imageBuffer).ensureAlpha();

  if (scale !== 1) {
    const meta = await pipeline.metadata();
    const width = meta.width ?? 1;
    const height = meta.height ?? 1;
    let newWidth = Math.max(1, Math.round(width * scale));
    let newHeight = Math.max(1, Math.round(height * scale));

    if (newWidth > MAX_ALIGNMENT_DIMENSION || newHeight > MAX_ALIGNMENT_DIMENSION) {
      const ratio = Math.min(
        MAX_ALIGNMENT_DIMENSION / newWidth,
        MAX_ALIGNMENT_DIMENSION / newHeight
      );
      newWidth = Math.max(1, Math.floor(newWidth * ratio));
      newHeight = Math.max(1, Math.floor(newHeight * ratio));
    }

    pipeline = pipeline.resize(newWidth, newHeight);
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

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

function fillBlock(
  block: Float64Array,
  luma: Float64Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  offsetX = 0,
  offsetY = 0
): void {
  for (let y = 0; y < BLOCK_SIZE; y++) {
    const srcY = by * BLOCK_SIZE + y + offsetY;
    for (let x = 0; x < BLOCK_SIZE; x++) {
      const srcX = bx * BLOCK_SIZE + x + offsetX;
      if (srcY < 0 || srcY >= height || srcX < 0 || srcX >= width) {
        block[y * BLOCK_SIZE + x] = 128;
      } else {
        block[y * BLOCK_SIZE + x] = luma[srcY * width + srcX]!;
      }
    }
  }
}

function computeSampleStep(blockCount: number): number {
  // For images that are 1024 px or smaller we can afford to evaluate every
  // block; this makes the coarse offset estimate exact and keeps the much
  // smaller refinement neighbourhood reliable.
  if (blockCount <= 16384) {
    return 1;
  }
  const step = Math.max(1, Math.floor(blockCount / ALIGNMENT_SAMPLE_BLOCKS));
  return step % 2 === 0 ? step + 1 : step;
}

interface ExtractionScores {
  syncConfidence: number;
  syncSoftConfidence: number;
  confidence: number;
  softConfidence: number;
  bits: (0 | 1)[];
}

/**
 * Extract the watermark from a single candidate at a specific pixel offset.
 *
 * The offset is used when the screenshot is not block-aligned with the
 * original image. `sampleStep` controls how many blocks are evaluated:
 * use a value > 1 for fast alignment search, and 1 for the final full extraction.
 */
function extractAtOffset(
  image: ImageBlocks,
  bitStream: (0 | 1)[],
  offsetX: number,
  offsetY: number,
  sampleStep = 1
): ExtractionScores {
  const { width, height, blocksW, blocksH, luma } = image;
  const blockCount = blocksW * blocksH;
  const correlations = new Float64Array(TOTAL_BITS);
  const counts = new Int32Array(TOTAL_BITS);

  const blockBuffer = new Float64Array(64);

  for (let b = 0; b < blockCount; b += sampleStep) {
    const bx = b % blocksW;
    const by = Math.floor(b / blocksW);
    fillBlock(blockBuffer, luma, width, height, bx, by, offsetX, offsetY);
    const dct = forwardDCT2D(blockBuffer);
    const bitIndex = b % TOTAL_BITS;

    for (let k = 0; k < COEFFS_PER_BLOCK; k++) {
      const coeffSlot = (b * COEFFS_PER_BLOCK + k) % MIDFREQ_INDICES.length;
      const coeffIndex = MIDFREQ_INDICES[coeffSlot]!;
      correlations[bitIndex]! += dct[coeffIndex]!;
      counts[bitIndex]!++;
    }
  }

  const avgs = new Float64Array(TOTAL_BITS);
  const bits: (0 | 1)[] = [];
  for (let i = 0; i < TOTAL_BITS; i++) {
    avgs[i] = counts[i]! > 0 ? correlations[i]! / counts[i]! : 0;
    bits.push(avgs[i]! > 0 ? 1 : 0);
  }

  let syncMatches = 0;
  let syncWeighted = 0;
  let syncAbs = 0;
  for (let i = 0; i < SYNC_LENGTH; i++) {
    if (bits[i]! === SYNC_PATTERN[i]!) syncMatches++;
    const sign = SYNC_PATTERN[i]! === 1 ? 1 : -1;
    syncWeighted += sign * avgs[i]!;
    syncAbs += Math.abs(avgs[i]!);
  }
  const syncConfidence = syncMatches / SYNC_LENGTH;
  const syncSoftConfidence = syncAbs > 0 ? syncWeighted / syncAbs : 0;

  let payloadMatches = 0;
  let weighted = syncWeighted;
  let absSum = syncAbs;
  for (let i = SYNC_LENGTH; i < TOTAL_BITS; i++) {
    if (bits[i]! === bitStream[i]!) payloadMatches++;
    const sign = bitStream[i]! === 1 ? 1 : -1;
    weighted += sign * avgs[i]!;
    absSum += Math.abs(avgs[i]!);
  }
  const confidence = (syncMatches + payloadMatches) / TOTAL_BITS;
  const softConfidence = absSum > 0 ? weighted / absSum : 0;

  return { syncConfidence, syncSoftConfidence, confidence, softConfidence, bits };
}

/**
 * Find the best pixel offset for the given scale by looking for the strongest
 * known sync pattern across all 64 sub-block alignments.
 */
function findBestOffset(
  image: ImageBlocks,
  referenceBitStream: (0 | 1)[],
  sampleStep = 1
): { offsetX: number; offsetY: number; syncConfidence: number } {
  let bestOffsetX = 0;
  let bestOffsetY = 0;
  let bestSyncConfidence = -1;

  for (let oy = 0; oy < BLOCK_SIZE; oy++) {
    for (let ox = 0; ox < BLOCK_SIZE; ox++) {
      const { syncConfidence } = extractAtOffset(
        image,
        referenceBitStream,
        ox,
        oy,
        sampleStep
      );
      if (syncConfidence > bestSyncConfidence) {
        bestSyncConfidence = syncConfidence;
        bestOffsetX = ox;
        bestOffsetY = oy;
      }
    }
  }

  return { offsetX: bestOffsetX, offsetY: bestOffsetY, syncConfidence: bestSyncConfidence };
}

interface AlignmentResult {
  scale: number;
  offsetX: number;
  offsetY: number;
  syncConfidence: number;
  syncSoftConfidence: number;
}

/**
 * Search both scale and pixel offset to find the alignment that gives the
 * strongest known sync pattern. Zoomed-out screenshots are downscaled copies
 * of the watermarked layer, so we resize the input by each candidate scale
 * before searching offsets.
 *
 * For small source images (the screenshot itself is small, not the original
 * layer), the 8×8 offset search is fast enough at full block density that we
 * can skip the coarse/refine split and simply pick the scale/offset with the
 * strongest sync. This avoids the refinement neighbourhood missing the true
 * peak when the sampled coarse estimate is off by more than a couple of pixels.
 */
async function findBestAlignment(
  imageBuffer: Buffer,
  referenceBitStream: (0 | 1)[]
): Promise<AlignmentResult> {
  const fullScaleImage = await loadImageLuma(imageBuffer, 1);
  const totalBlocks = fullScaleImage.blocksW * fullScaleImage.blocksH;

  // Tiny images: just search the native resolution.
  if (totalBlocks > 0 && totalBlocks <= 1024) {
    const { offsetX, offsetY, syncConfidence } = findBestOffset(
      fullScaleImage,
      referenceBitStream,
      1
    );
    const { syncSoftConfidence } = extractAtOffset(
      fullScaleImage,
      referenceBitStream,
      offsetX,
      offsetY,
      1
    );
    return { scale: 1, offsetX, offsetY, syncConfidence, syncSoftConfidence };
  }

  // Full-resolution layers are already at the original block size; upscaling
  // them would only waste time and invite false-positive scale matches.
  if (totalBlocks >= 65536) {
    const sampleStep = computeSampleStep(totalBlocks);
    const { offsetX, offsetY } = findBestOffset(
      fullScaleImage,
      referenceBitStream,
      sampleStep
    );

    const { syncConfidence, syncSoftConfidence } = extractAtOffset(
      fullScaleImage,
      referenceBitStream,
      offsetX,
      offsetY,
      sampleStep
    );

    if (syncConfidence >= SYNC_CONFIDENCE_THRESHOLD) {
      return { scale: 1, offsetX, offsetY, syncConfidence, syncSoftConfidence };
    }

    const { offsetX: fx, offsetY: fy } = findBestOffset(
      fullScaleImage,
      referenceBitStream,
      1
    );
    const { syncConfidence: fullHard, syncSoftConfidence: fullSyncSoft } = extractAtOffset(
      fullScaleImage,
      referenceBitStream,
      fx,
      fy,
      1
    );
    return { scale: 1, offsetX: fx, offsetY: fy, syncConfidence: fullHard, syncSoftConfidence: fullSyncSoft };
  }

  // Small-to-medium screenshots: search every candidate scale at full block
  // density. The image is small enough that the 64×8×8 DCTs per scale are cheap.
  // Scale selection uses the hard sync confidence (which is user-agnostic)
  // instead of an arbitrary reference user's payload, so the choice does not
  // depend on which user happened to be first in the list.
  const seenDimensions = new Set<string>();
  const candidates: Array<{
    scale: number;
    offsetX: number;
    offsetY: number;
    syncConfidence: number;
    syncSoftConfidence: number;
  }> = [];

  for (const scale of EXTRACT_SCALE_FACTORS) {
    const image = await loadImageLuma(imageBuffer, scale);
    if (image.blocksW === 0 || image.blocksH === 0) {
      continue;
    }

    const dimKey = `${image.width}x${image.height}`;
    if (seenDimensions.has(dimKey)) {
      continue;
    }
    seenDimensions.add(dimKey);

    const { offsetX, offsetY } = findBestOffset(
      image,
      referenceBitStream,
      1
    );

    const { syncConfidence, syncSoftConfidence } = extractAtOffset(
      image,
      referenceBitStream,
      offsetX,
      offsetY,
      1
    );

    candidates.push({
      scale,
      offsetX,
      offsetY,
      syncConfidence,
      syncSoftConfidence,
    });

    if (syncConfidence >= 0.99) {
      break;
    }
  }

  if (candidates.length === 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, syncConfidence: -1, syncSoftConfidence: -1 };
  }

  // Pick the scale/offset with the strongest hard sync signal. The sync
  // pattern is identical for every user, so this is neutral across candidates.
  const viable = candidates.filter(
    (c) => c.syncConfidence >= SYNC_CONFIDENCE_THRESHOLD
  );
  const pool = viable.length > 0 ? viable : candidates;
  pool.sort((a, b) => b.syncConfidence - a.syncConfidence);
  const best = pool[0]!;

  return {
    scale: best.scale,
    offsetX: best.offsetX,
    offsetY: best.offsetY,
    syncConfidence: best.syncConfidence,
    syncSoftConfidence: best.syncSoftConfidence,
  };
}

export async function extractWatermark(
  imageBuffer: Buffer,
  context: ExtractContext
): Promise<ExtractResult> {
  assertSecret();

  const bitStream = getEmbeddedBitStream(context.watermarkNumber);
  const { scale, offsetX, offsetY, syncConfidence, syncSoftConfidence } =
    await findBestAlignment(imageBuffer, bitStream);

  const image = await loadImageLuma(imageBuffer, scale);
  const { confidence, softConfidence } = extractAtOffset(
    image,
    bitStream,
    offsetX,
    offsetY
  );

  if (
    syncSoftConfidence < SYNC_SOFT_CONFIDENCE_THRESHOLD ||
    softConfidence < SOFT_CONFIDENCE_THRESHOLD ||
    syncConfidence < SYNC_CONFIDENCE_THRESHOLD
  ) {
    return {
      found: false,
      userId: null,
      watermarkNumber: null,
      confidence,
      syncConfidence,
      softConfidence,
      syncSoftConfidence,
      offsetX,
      offsetY,
      scale,
    };
  }

  return {
    found: true,
    userId: context.userId,
    watermarkNumber: context.watermarkNumber,
    confidence,
    syncConfidence,
    softConfidence,
    syncSoftConfidence,
    offsetX,
    offsetY,
    scale,
  };
}

export async function tryExtractWatermark(
  imageBuffer: Buffer,
  context: { mapId: string; candidates: Array<{ userId: string; watermarkNumber: number }> }
): Promise<ExtractResult> {
  assertSecret();
  if (context.candidates.length === 0) {
    return {
      found: false,
      userId: null,
      watermarkNumber: null,
      confidence: 0,
      syncConfidence: 0,
      softConfidence: 0,
      syncSoftConfidence: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
  }

  // Use the first candidate as a reference to find the best scale/offset
  // via the known sync pattern. The sync pattern is identical for every user,
  // so the alignment is user-agnostic.
  const referenceBitStream = getEmbeddedBitStream(
    context.candidates[0]!.watermarkNumber
  );
  const { scale, offsetX, offsetY, syncConfidence, syncSoftConfidence } =
    await findBestAlignment(imageBuffer, referenceBitStream);

  // If even the hard sync is too weak, the alignment is probably garbage and
  // there is no watermark here.
  if (syncConfidence < SYNC_CONFIDENCE_THRESHOLD) {
    return {
      found: false,
      userId: null,
      watermarkNumber: null,
      confidence: 0,
      syncConfidence,
      softConfidence: 0,
      syncSoftConfidence,
      offsetX,
      offsetY,
      scale,
    };
  }

  const image = await loadImageLuma(imageBuffer, scale);

  const candidateResults: ExtractResult[] = [];
  for (const candidate of context.candidates) {
    const bitStream = getEmbeddedBitStream(candidate.watermarkNumber);
    const {
      syncConfidence: userSync,
      syncSoftConfidence: userSyncSoft,
      confidence,
      softConfidence,
    } = extractAtOffset(image, bitStream, offsetX, offsetY);

    candidateResults.push({
      found: false,
      userId: candidate.userId,
      watermarkNumber: candidate.watermarkNumber,
      confidence,
      syncConfidence: userSync,
      softConfidence,
      syncSoftConfidence: userSyncSoft,
      offsetX,
      offsetY,
      scale,
    });
  }

  candidateResults.sort((a, b) => b.softConfidence - a.softConfidence);
  const best = candidateResults[0]!;
  const secondBest = candidateResults[1];

  const margin = secondBest ? best.softConfidence - secondBest.softConfidence : 1;

  if (
    best.syncSoftConfidence >= SYNC_SOFT_CONFIDENCE_THRESHOLD &&
    best.softConfidence >= SOFT_CONFIDENCE_THRESHOLD &&
    margin >= CONFIDENCE_MARGIN
  ) {
    return { ...best, found: true };
  }

  return {
    found: false,
    userId: best.userId,
    watermarkNumber: best.watermarkNumber,
    confidence: best.confidence,
    syncConfidence: best.syncConfidence,
    softConfidence: best.softConfidence,
    syncSoftConfidence: best.syncSoftConfidence,
    offsetX,
    offsetY,
    scale,
  };
}
