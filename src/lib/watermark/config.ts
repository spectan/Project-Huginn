import { createHash } from "crypto";
import { join } from "path";

/**
 * Server-side secret used to derive watermark chip patterns.
 * In production this should be set through OpenClaw SecretRefs / the host's
 * secrets mechanism, not committed to the repo.
 */
export const WATERMARK_SECRET = process.env.WATERMARK_SECRET ?? "";

/** Watermark format version. Bumped when the embedding scheme changes. */
export const WATERMARK_VERSION = 6;

/**
 * Spatial block size for the color-dither watermark. Larger blocks are more
 * robust to compression/resizing; smaller blocks carry more independent
 * samples. 16×16 is a good compromise for pixel-art game maps.
 */
export const BLOCK_SIZE = 16;

/**
 * Luma delta applied to every pixel in a block. Positive chips brighten,
 * negative chips darken. The change is applied to R, G, and B equally so
 * hue is preserved.
 */
export const DITHER_DELTA = 3;

/**
 * Candidate relative scales searched by the extractor. A screenshot taken
 * zoomed out is a downscaled copy of the watermarked layer; upscaling it back
 * toward the original resolution restores the block grid.
 */
export const EXTRACT_SCALE_FACTORS: number[] = [1, 2, 4, 8];

/** Maximum pixel dimension allowed during alignment search. */
export const MAX_ALIGNMENT_DIMENSION = 2048;

/**
 * Minimum correlation score required before a watermark is considered
 * present.
 */
export const CONFIDENCE_THRESHOLD = 0.3;

/**
 * The best candidate must beat the second-best candidate by at least this
 * score margin to avoid false positives when multiple users look similar.
 */
export const CONFIDENCE_MARGIN = 0.05;

// Backwards-compatible aliases used by existing tests and callers.
export const SOFT_CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;
export const SYNC_CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;
export const SYNC_SOFT_CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;

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
      `${fileHash}:${userId}:${layerId}:${WATERMARK_VERSION}:${BLOCK_SIZE}:${DITHER_DELTA}`
    )
    .digest("hex");
}

export function assertSecret(): void {
  if (!WATERMARK_SECRET) {
    throw new Error("WATERMARK_SECRET is not configured");
  }
}
