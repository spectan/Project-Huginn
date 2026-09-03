import { createHash } from "crypto";
import { join } from "path";

/**
 * Server-side secret used to derive watermark positions and the user hash.
 * In production this should be set through OpenClaw SecretRefs / the host's
 * secrets mechanism, not committed to the repo.
 */
export const WATERMARK_SECRET = process.env.WATERMARK_SECRET ?? "";

/**
 * Derive a pseudorandom sync pattern from the watermark secret and version.
 * A fixed alternating pattern (e.g. 010101...) matches the natural sign
 * alternation of mid-frequency DCT coefficients, producing high false-
 * positive sync scores on unwatermarked images. A secret-derived random
 * pattern fixes that while still being reproducible for extraction.
 */
function deriveSyncPattern(
  secret: string,
  version: number,
  length: number
): (0 | 1)[] {
  const pattern: (0 | 1)[] = [];
  let hash = createHash("sha256")
    .update(`${secret}:watermark-sync:${version}`)
    .digest();

  for (let i = 0; i < length; i++) {
    if (i > 0 && i % hash.length === 0) {
      hash = createHash("sha256").update(hash).update(String(i)).digest();
    }
    pattern.push((hash[i % hash.length]! & 1) as 0 | 1);
  }

  return pattern;
}

export const BLOCK_SIZE = 8;

/** Watermark format version. Bumped when the embedding scheme changes. */
export const WATERMARK_VERSION = 4;

/**
 * Number of payload bits. A shorter payload lets us spread each bit across
 * more blocks, making the watermark more robust to cropping and compression.
 */
export const PAYLOAD_BITS = 16;

/** Number of known sync bits at the start of the embedded stream. */
export const SYNC_LENGTH = 16;

/** Total number of bits embedded (sync + payload). */
export const TOTAL_BITS = SYNC_LENGTH + PAYLOAD_BITS;

/** Known sync pattern (0/1 bits). Used for detection and alignment. */
export const SYNC_PATTERN: (0 | 1)[] = deriveSyncPattern(
  WATERMARK_SECRET,
  WATERMARK_VERSION,
  SYNC_LENGTH
);

/**
 * Mid-frequency DCT coefficient positions (row-major indices in the 8×8
 * block). We avoid DC (0) and very low frequencies because changes there are
 * visible, and avoid very high frequencies because they are destroyed by
 * JPEG compression. These are linear indices (v * 8 + u).
 */
export const MIDFREQ_INDICES: number[] = [
  9, 10, 11, 12,
  17, 18, 19, 20,
  25, 26, 27, 28,
  33, 34, 35, 36,
];

/** Number of coefficients modified per block. */
export const COEFFS_PER_BLOCK = 8;

/** Strength of the spread-spectrum signal. Larger = more robust but more visible. */
const configuredAlpha = parseFloat(process.env.WATERMARK_ALPHA ?? "1.5");
export const SS_ALPHA = Number.isFinite(configuredAlpha) ? configuredAlpha : 1.5;

/**
 * Candidate relative scales searched by the extractor. Zoomed-out screenshots
 * are downscaled copies of the watermarked layer; upscaling them back toward
 * the original resolution restores the 8×8 block grid and makes the watermark
 * recoverable.
 */
export const EXTRACT_SCALE_FACTORS: number[] = [1, 2, 4, 8];

/** Maximum pixel dimension allowed during alignment search. */
export const MAX_ALIGNMENT_DIMENSION = 2048;

/** Minimum hard sync confidence required before a watermark is considered found. */
export const SYNC_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Minimum *soft* (matched-filter) sync score required for a positive detection.
 * Soft scores are signed, magnitude-weighted correlations, so random noise
 * clusters near 0 while a real signal is clearly positive.
 */
export const SYNC_SOFT_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Minimum *soft* overall score required for a positive detection.
 */
export const SOFT_CONFIDENCE_THRESHOLD = 0.4;

/**
 * The best candidate must beat the second-best candidate by at least this
 * soft-score margin to avoid false positives when multiple users look similar.
 */
export const CONFIDENCE_MARGIN = 0.05;

/**
 * Target number of blocks evaluated during the coarse alignment search.
 * A smaller subset keeps scale/offset search fast; the final extraction always
 * uses every block.
 */
export const ALIGNMENT_SAMPLE_BLOCKS = 4096;

/** Where watermarked image caches are stored. */
export function getWatermarkCacheDir(): string {
  const base = process.env.MAP_STORAGE_PATH ?? process.cwd();
  return join(base, ".watermarks");
}

/** Build a deterministic cache key for a watermarked image. */
export function buildCacheKey(
  fileHash: string,
  userId: string,
  layerId: string
): string {
  return createHash("sha256")
    .update(
      `${fileHash}:${userId}:${layerId}:${WATERMARK_VERSION}:${SS_ALPHA}:${PAYLOAD_BITS}:${SYNC_LENGTH}:${COEFFS_PER_BLOCK}`
    )
    .digest("hex");
}

export function assertSecret(): void {
  if (!WATERMARK_SECRET) {
    throw new Error("WATERMARK_SECRET is not configured");
  }
}
