import { createHash } from "crypto";
import { join } from "path";

/** Watermark format version. Bumped when the embedding scheme changes. */
export const WATERMARK_VERSION = 8;

/**
 * Alpha (0-255) of the red digit overlay in the small tile. The watermark is
 * a barely-visible red digit pattern; invisibility comes from the low alpha,
 * robustness from the stroke width (wide strokes survive resampling).
 */
export const OVERLAY_ALPHA = 8;

/**
 * Alpha (0-255) of the large digit overlay tile. Roughly half of
 * OVERLAY_ALPHA: the large digits cover far more area, so they need less
 * per-pixel strength to carry the same signal.
 */
export const LARGE_TILE_ALPHA = 4;

// Dual-scale tiling geometry. The small tile stays readable around native
// zoom; the large tile survives heavy downscaling (browser zoom-out).
export const SMALL_TILE_WIDTH = 240;
export const SMALL_TILE_HEIGHT = 120;
export const SMALL_DIGIT_HEIGHT = 40;

export const LARGE_TILE_WIDTH = 960;
export const LARGE_TILE_HEIGHT = 480;
export const LARGE_DIGIT_HEIGHT = 160;

/** Digits are drawn rotated to make casual cropping/rotation less tidy. */
export const DIGIT_ROTATION_DEGREES = -30;

/**
 * Stroke thickness as a fraction of digit height. 0.175 gives a 7px stroke
 * at the 40px small-digit height; thick strokes are what survives
 * downscaling, not alpha.
 */
export const DIGIT_STROKE_RATIO = 0.175;

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
      `${fileHash}:${userId}:${layerId}:${WATERMARK_VERSION}:${OVERLAY_ALPHA}:${LARGE_TILE_ALPHA}:${SMALL_TILE_WIDTH}x${SMALL_TILE_HEIGHT}:${SMALL_DIGIT_HEIGHT}:${LARGE_TILE_WIDTH}x${LARGE_TILE_HEIGHT}:${LARGE_DIGIT_HEIGHT}`
    )
    .digest("hex");
}
