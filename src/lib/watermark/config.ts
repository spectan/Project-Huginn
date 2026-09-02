import { createHash } from "crypto";
import { join } from "path";

/**
 * Server-side secret used to derive watermark positions and the user hash.
 * In production this should be set through OpenClaw SecretRefs / the host's
 * secrets mechanism, not committed to the repo.
 */
export const WATERMARK_SECRET = process.env.WATERMARK_SECRET ?? "";

export const BLOCK_SIZE = 8;

/** Watermark format version. Bumped when the embedding scheme changes. */
export const WATERMARK_VERSION = 2;

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
export const SYNC_PATTERN: (0 | 1)[] = "0101010101010101"
  .split("")
  .map((c) => (c === "1" ? 1 : 0));

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

/** Minimum sync confidence required before a watermark is considered found. */
export const SYNC_CONFIDENCE_THRESHOLD = 0.8;

/** Minimum overall bit-match confidence required for a positive detection. */
export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Target number of blocks evaluated during the coarse alignment search.
 * A smaller subset keeps scale/offset search fast; the final extraction always
 * uses every block.
 */
export const ALIGNMENT_SAMPLE_BLOCKS = 4096;

/**
 * The best candidate must beat the second-best candidate by at least this
 * margin to avoid false positives when multiple users look similar.
 */
export const CONFIDENCE_MARGIN = 0.05;

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
