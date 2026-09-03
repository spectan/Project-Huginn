import sharp from "sharp";
import { join } from "path";
import {
  BLOCK_SIZE,
  CONFIDENCE_MARGIN,
  CONFIDENCE_THRESHOLD,
  EXTRACT_SCALE_FACTORS,
  MAX_ALIGNMENT_DIMENSION,
  assertSecret,
} from "./config";
import { createChipPattern } from "./codec";
import { prisma } from "@/lib/db/prisma";

export interface ExtractContext {
  mapId: string;
  userId: string;
  watermarkNumber: number;
  layerId?: string;
  /** Optional override for testing; if omitted the original is looked up via Prisma. */
  originalImageBuffer?: Buffer;
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

interface ImageChroma {
  width: number;
  height: number;
  blocksW: number;
  blocksH: number;
  cb: Float64Array;
  cr: Float64Array;
  integralCb: Float64Array;
  integralCr: Float64Array;
}

function rgbToChroma(
  r: number,
  g: number,
  b: number
): { cb: number; cr: number } {
  return {
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

function buildIntegral(
  values: Float64Array,
  width: number,
  height: number
): Float64Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += values[(y - 1) * width + (x - 1)]!;
      integral[y * stride + x] = integral[(y - 1) * stride + x]! + rowSum;
    }
  }
  return integral;
}

async function loadImageChroma(
  imageBuffer: Buffer,
  scale = 1
): Promise<ImageChroma> {
  let pipeline = sharp(imageBuffer).ensureAlpha();

  if (scale !== 1) {
    const meta = await pipeline.metadata();
    const width = meta.width ?? 1;
    const height = meta.height ?? 1;
    let newWidth = Math.max(1, Math.round(width * scale));
    let newHeight = Math.max(1, Math.round(height * scale));

    if (
      newWidth > MAX_ALIGNMENT_DIMENSION ||
      newHeight > MAX_ALIGNMENT_DIMENSION
    ) {
      const ratio = Math.min(
        MAX_ALIGNMENT_DIMENSION / newWidth,
        MAX_ALIGNMENT_DIMENSION / newHeight
      );
      newWidth = Math.max(1, Math.floor(newWidth * ratio));
      newHeight = Math.max(1, Math.floor(newHeight * ratio));
    }

    pipeline = pipeline.resize(newWidth, newHeight);
  }

  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels ?? 4;
  const pixelCount = width * height;
  const cb = new Float64Array(pixelCount);
  const cr = new Float64Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * channels;
    const c = rgbToChroma(data[idx]!, data[idx + 1]!, data[idx + 2]!);
    cb[i] = c.cb;
    cr[i] = c.cr;
  }

  const integralCb = buildIntegral(cb, width, height);
  const integralCr = buildIntegral(cr, width, height);

  const blocksW = Math.floor(width / BLOCK_SIZE);
  const blocksH = Math.floor(height / BLOCK_SIZE);
  return { width, height, blocksW, blocksH, cb, cr, integralCb, integralCr };
}

function blockAverage(
  integral: Float64Array,
  width: number,
  x: number,
  y: number,
  size: number
): number | null {
  if (x < 0 || y < 0) return null;
  const x2 = x + size;
  const y2 = y + size;
  if (x2 > width || y2 > integral.length / (width + 1) - 1) return null;
  const stride = width + 1;
  const sum =
    integral[y2 * stride + x2]! -
    integral[y * stride + x2]! -
    integral[y2 * stride + x]! +
    integral[y * stride + x]!;
  return sum / (size * size);
}

interface ScoreResult {
  score: number;
  sampleCount: number;
}

function pearsonScore(
  observed: Float64Array,
  chips: Int8Array,
  count: number
): ScoreResult {
  if (count === 0) {
    return { score: 0, sampleCount: 0 };
  }

  // Center observed deltas so global color shifts are ignored.
  let mean = 0;
  for (let i = 0; i < count; i++) {
    mean += observed[i]!;
  }
  mean /= count;

  let num = 0;
  let denomObserved = 0;
  let denomChips = 0;
  for (let i = 0; i < count; i++) {
    const centered = observed[i]! - mean;
    const chip = chips[i]!;
    num += centered * chip;
    denomObserved += centered * centered;
    denomChips += chip * chip;
  }

  const denom = Math.sqrt(denomObserved * denomChips);
  if (denom === 0) {
    return { score: 0, sampleCount: count };
  }

  return { score: num / denom, sampleCount: count };
}

interface AlignmentResult {
  scale: number;
  startBx: number;
  startBy: number;
  offsetX: number;
  offsetY: number;
  score: number;
}

/**
 * Compute observed Cb and Cr deltas for every block of the (rescaled)
 * screenshot aligned to a window in the original starting at coarse block
 * position (startBx, startBy) and sub-block pixel offset (offsetX, offsetY).
 *
 * Screenshot block (sx, sy) is compared against original block
 * (startBx + sx, startBy + sy), shifted by (offsetX, offsetY). The chips
 * array is indexed by absolute original block coordinates.
 */
function computeWindowDeltas(
  original: ImageChroma,
  screenshot: ImageChroma,
  startBx: number,
  startBy: number,
  offsetX: number,
  offsetY: number,
  chips: Int8Array,
  outObservedCb: Float64Array,
  outObservedCr: Float64Array,
  outChips: Int8Array
): number {
  const oW = original.width;
  const oBlocksW = original.blocksW;
  const sW = screenshot.width;
  const sH = screenshot.height;

  let count = 0;
  for (let sy = 0; sy < screenshot.blocksH; sy++) {
    const by = startBy + sy;
    if (by < 0 || by >= original.blocksH) continue;

    const oy = by * BLOCK_SIZE + offsetY;
    const syQ = sy * BLOCK_SIZE;
    if (oy < 0 || oy + BLOCK_SIZE > original.height) continue;
    if (syQ < 0 || syQ + BLOCK_SIZE > sH) continue;

    for (let sx = 0; sx < screenshot.blocksW; sx++) {
      const bx = startBx + sx;
      if (bx < 0 || bx >= original.blocksW) continue;

      const ox = bx * BLOCK_SIZE + offsetX;
      const sxQ = sx * BLOCK_SIZE;
      if (ox < 0 || ox + BLOCK_SIZE > original.width) continue;
      if (sxQ < 0 || sxQ + BLOCK_SIZE > sW) continue;

      const origCb = blockAverage(original.integralCb, oW, ox, oy, BLOCK_SIZE);
      const origCr = blockAverage(original.integralCr, oW, ox, oy, BLOCK_SIZE);
      const shotCb = blockAverage(screenshot.integralCb, sW, sxQ, syQ, BLOCK_SIZE);
      const shotCr = blockAverage(screenshot.integralCr, sW, sxQ, syQ, BLOCK_SIZE);
      if (
        origCb === null ||
        origCr === null ||
        shotCb === null ||
        shotCr === null
      ) {
        continue;
      }

      outObservedCb[count] = shotCb - origCb;
      outObservedCr[count] = shotCr - origCr;
      outChips[count] = chips[by * oBlocksW + bx]!;
      count++;
    }
  }

  return count;
}

/** Combined Cb+Cr Pearson score at an alignment. */
function scoreWindow(
  original: ImageChroma,
  screenshot: ImageChroma,
  startBx: number,
  startBy: number,
  offsetX: number,
  offsetY: number,
  chips: Int8Array,
  observedCb: Float64Array,
  observedCr: Float64Array,
  expected: Int8Array
): number {
  const count = computeWindowDeltas(
    original,
    screenshot,
    startBx,
    startBy,
    offsetX,
    offsetY,
    chips,
    observedCb,
    observedCr,
    expected
  );
  if (count === 0) return 0;
  const cbScore = pearsonScore(observedCb, expected, count).score;
  const crScore = pearsonScore(observedCr, expected, count).score;
  return (cbScore + crScore) / 2;
}

async function loadOriginalBuffer(context: ExtractContext): Promise<Buffer> {
  if (context.originalImageBuffer) {
    return context.originalImageBuffer;
  }

  const layerId = context.layerId ?? `${context.mapId}:default`;

  let imagePath: string | null = null;
  if (layerId === `${context.mapId}:default`) {
    const map = await prisma.map.findUnique({
      where: { id: context.mapId },
      select: { imagePath: true },
    });
    imagePath = map?.imagePath ?? null;
  } else {
    const layer = await prisma.mapLayer.findFirst({
      where: { id: layerId, mapId: context.mapId },
      select: { imagePath: true },
    });
    imagePath = layer?.imagePath ?? null;
  }

  if (imagePath === null || imagePath.length === 0) {
    throw new Error(`Could not find original image for ${layerId}`);
  }

  const absolutePath = join(process.cwd(), "public", imagePath);
  const { readFile } = await import("fs/promises");
  return readFile(absolutePath);
}

function makeExtractResult(
  found: boolean,
  candidate: { userId: string; watermarkNumber: number } | null,
  score: number,
  alignment: AlignmentResult
): ExtractResult {
  return {
    found,
    userId: candidate?.userId ?? null,
    watermarkNumber: candidate?.watermarkNumber ?? null,
    confidence: score,
    syncConfidence: score,
    softConfidence: score,
    syncSoftConfidence: score,
    offsetX: alignment.offsetX,
    offsetY: alignment.offsetY,
    scale: alignment.scale,
  };
}

export async function extractWatermark(
  imageBuffer: Buffer,
  context: ExtractContext
): Promise<ExtractResult> {
  assertSecret();

  const layerId = context.layerId ?? `${context.mapId}:default`;
  const originalBuffer = await loadOriginalBuffer(context);

  const original = await loadImageChroma(originalBuffer, 1);
  const referenceChips = createChipPattern(
    { mapId: context.mapId, layerId, userId: context.userId },
    original.blocksW,
    original.blocksH
  );

  const alignment = await findBestAlignmentForScales(
    imageBuffer,
    original,
    referenceChips
  );

  const screenshot = await loadImageChroma(imageBuffer, alignment.scale);
  const score = scoreAtAlignment(original, screenshot, alignment, referenceChips);

  const found = score >= CONFIDENCE_THRESHOLD;
  return makeExtractResult(
    found,
    { userId: context.userId, watermarkNumber: context.watermarkNumber },
    score,
    alignment
  );
}

interface ScaleCandidate {
  scale: number;
  screenshot: ImageChroma;
}

async function findBestAlignmentForScales(
  imageBuffer: Buffer,
  original: ImageChroma,
  chips: Int8Array
): Promise<AlignmentResult> {
  const scaledImages: ScaleCandidate[] = [];

  for (const scale of EXTRACT_SCALE_FACTORS) {
    const screenshot = await loadImageChroma(imageBuffer, scale);
    if (screenshot.blocksW === 0 || screenshot.blocksH === 0) {
      continue;
    }
    scaledImages.push({ scale, screenshot });
  }

  let best: AlignmentResult = {
    scale: 1,
    startBx: 0,
    startBy: 0,
    offsetX: 0,
    offsetY: 0,
    score: -Infinity,
  };

  const maxBlocks = original.blocksW * original.blocksH;
  const observedCb = new Float64Array(maxBlocks);
  const observedCr = new Float64Array(maxBlocks);
  const expected = new Int8Array(maxBlocks);

  for (const { scale, screenshot } of scaledImages) {
    const bestForScale = findBestAlignmentForScale(
      original,
      screenshot,
      chips,
      observedCb,
      observedCr,
      expected,
      scale
    );
    if (bestForScale.score > best.score) {
      best = bestForScale;
    }
  }

  if (!Number.isFinite(best.score)) {
    best.score = 0;
  }

  return best;
}

const COARSE_POSITIONS_TO_REFINE = 5;

function findBestAlignmentForScale(
  original: ImageChroma,
  screenshot: ImageChroma,
  chips: Int8Array,
  observedCb: Float64Array,
  observedCr: Float64Array,
  expected: Int8Array,
  scale: number
): AlignmentResult {
  let best: AlignmentResult = {
    scale,
    startBx: 0,
    startBy: 0,
    offsetX: 0,
    offsetY: 0,
    score: -Infinity,
  };

  const maxStartBx = Math.max(0, original.blocksW - screenshot.blocksW + 1);
  const maxStartBy = Math.max(0, original.blocksH - screenshot.blocksH + 1);

  // Coarse search: sub-block offset (0,0), all valid coarse positions.
  const topCoarse: Array<{
    startBx: number;
    startBy: number;
    score: number;
  }> = [];
  for (let startBy = 0; startBy < maxStartBy; startBy++) {
    for (let startBx = 0; startBx < maxStartBx; startBx++) {
      const score = scoreWindow(
        original,
        screenshot,
        startBx,
        startBy,
        0,
        0,
        chips,
        observedCb,
        observedCr,
        expected
      );
      if (score === 0 && screenshot.blocksW * screenshot.blocksH > 0) {
        // No overlapping blocks; skip.
      }

      if (
        topCoarse.length < COARSE_POSITIONS_TO_REFINE ||
        score > topCoarse[topCoarse.length - 1]!.score
      ) {
        topCoarse.push({ startBx, startBy, score });
        topCoarse.sort((a, b) => b.score - a.score);
        if (topCoarse.length > COARSE_POSITIONS_TO_REFINE) {
          topCoarse.pop();
        }
      }
    }
  }

  // Fine search: full sub-block offsets at the best coarse positions.
  for (const coarse of topCoarse) {
    for (let oy = 0; oy < BLOCK_SIZE; oy++) {
      for (let ox = 0; ox < BLOCK_SIZE; ox++) {
        const score = scoreWindow(
          original,
          screenshot,
          coarse.startBx,
          coarse.startBy,
          ox,
          oy,
          chips,
          observedCb,
          observedCr,
          expected
        );
        if (score > best.score) {
          best = {
            scale,
            startBx: coarse.startBx,
            startBy: coarse.startBy,
            offsetX: ox,
            offsetY: oy,
            score,
          };
        }
      }
    }
  }

  if (!Number.isFinite(best.score)) {
    best.score = 0;
  }

  return best;
}

function scoreAtAlignment(
  original: ImageChroma,
  screenshot: ImageChroma,
  alignment: AlignmentResult,
  chips: Int8Array
): number {
  const maxBlocks = original.blocksW * original.blocksH;
  const observedCb = new Float64Array(maxBlocks);
  const observedCr = new Float64Array(maxBlocks);
  const expected = new Int8Array(maxBlocks);
  return scoreWindow(
    original,
    screenshot,
    alignment.startBx,
    alignment.startBy,
    alignment.offsetX,
    alignment.offsetY,
    chips,
    observedCb,
    observedCr,
    expected
  );
}

/**
 * Produce a saturation-boosted rendering of an image so the chroma
 * watermark pattern becomes visible to the eye. Used by the admin reveal
 * page as a visual confirmation alongside the automated correlation score.
 */
export async function boostChromaImage(
  imageBuffer: Buffer,
  factor = 8
): Promise<Buffer> {
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
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const cb2 = 128 + (cb - 128) * factor;
    const cr2 = 128 + (cr - 128) * factor;
    const rr = Math.max(0, Math.min(255, Math.round(y + 1.402 * (cr2 - 128))));
    const gg = Math.max(
      0,
      Math.min(255, Math.round(y - 0.344136 * (cb2 - 128) - 0.714136 * (cr2 - 128)))
    );
    const bb = Math.max(0, Math.min(255, Math.round(y + 1.772 * (cb2 - 128))));
    out[idx] = rr;
    out[idx + 1] = gg;
    out[idx + 2] = bb;
  }

  return sharp(out, { raw: { width, height, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function tryExtractWatermark(
  imageBuffer: Buffer,
  context: {
    mapId: string;
    layerId?: string;
    originalImageBuffer?: Buffer;
    candidates: Array<{ userId: string; watermarkNumber: number }>;
  }
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

  const layerId = context.layerId ?? `${context.mapId}:default`;

  // Load the original image once, using the override or Prisma lookup.
  let originalBuffer: Buffer;
  if (context.originalImageBuffer) {
    originalBuffer = context.originalImageBuffer;
  } else {
    originalBuffer = await loadOriginalBuffer({
      mapId: context.mapId,
      userId: context.candidates[0]!.userId,
      watermarkNumber: context.candidates[0]!.watermarkNumber,
      layerId,
    });
  }

  const original = await loadImageChroma(originalBuffer, 1);

  // Use the first candidate's chip pattern for alignment.
  const referenceChips = createChipPattern(
    {
      mapId: context.mapId,
      layerId,
      userId: context.candidates[0]!.userId,
    },
    original.blocksW,
    original.blocksH
  );

  const alignment = await findBestAlignmentForScales(
    imageBuffer,
    original,
    referenceChips
  );

  const screenshot = await loadImageChroma(imageBuffer, alignment.scale);

  const candidateResults: ExtractResult[] = [];
  for (const candidate of context.candidates) {
    const chips = createChipPattern(
      { mapId: context.mapId, layerId, userId: candidate.userId },
      original.blocksW,
      original.blocksH
    );
    const score = scoreAtAlignment(original, screenshot, alignment, chips);

    candidateResults.push(makeExtractResult(false, candidate, score, alignment));
  }

  candidateResults.sort((a, b) => b.softConfidence - a.softConfidence);
  const best = candidateResults[0]!;
  const secondBest = candidateResults[1];
  const margin = secondBest
    ? best.softConfidence - secondBest.softConfidence
    : 1;

  if (
    best.softConfidence >= CONFIDENCE_THRESHOLD &&
    margin >= CONFIDENCE_MARGIN
  ) {
    return { ...best, found: true };
  }

  return best;
}
