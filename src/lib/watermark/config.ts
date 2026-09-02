import { createHash } from "crypto";
import { join } from "path";

/**
 * Server-side secret used to derive watermark positions and encrypt the
 * payload. In production this should be set through OpenClaw SecretRefs /
 * the host's secrets mechanism, not committed to the repo.
 */
export const WATERMARK_SECRET = process.env.WATERMARK_SECRET ?? "";

export const BLOCK_SIZE = 8;

/** Watermark format version. Bumped when the bit layout changes. */
export const WATERMARK_VERSION = 1;

/** Number of known sync/preamble bits at the start of the embedded stream. */
export const SYNC_LENGTH = 16;

/** Known sync pattern (0/1 bits). Used for detection and alignment. */
export const SYNC_PATTERN: (0 | 1)[] = "0101010101010101"
  .split("")
  .map((c) => (c === "1" ? 1 : 0));

/**
 * Mid-frequency DCT coefficient positions used for the QIM watermark.
 *
 * We avoid DC (0,0) and very low frequencies because changes there are visible,
 * and avoid very high frequencies because they are destroyed by JPEG/MP4
 * compression. The positions are listed in order; each block cycles through
 * them so the same bit is embedded in multiple frequency bands across its
 * repetitions.
 */
export const QIM_POSITIONS: Array<[number, number]> = [
  [2, 3],
  [3, 2],
  [3, 3],
  [4, 1],
  [1, 4],
  [4, 2],
  [2, 4],
  [3, 4],
];

/**
 * Quantization step for QIM embedding. A larger step is more robust but can
 * introduce visible artifacts. The pixel-domain impact is approximately
 * QIM_STEP / BLOCK_SIZE per grayscale level for a single coefficient change.
 */
export const QIM_STEP = 9.0;

/** Maximum username length that fits in the fixed-size watermark payload. */
export const MAX_USERNAME_BYTES = 32;

/** Fixed payload size used by the QIM block assignment. */
export const MAX_PAYLOAD_BITS = 4 + 8 + MAX_USERNAME_BYTES * 8 + 32 + 16;

/** Total bits embedded per block cycle (sync + payload). */
export const TOTAL_EMBEDDED_BITS = SYNC_LENGTH + MAX_PAYLOAD_BITS;

/** Base date for the compact 32-bit datestamp (days since this date, UTC). */
export const DATE_EPOCH = "2025-01-01";

/** Where watermarked image caches are stored. */
export function getWatermarkCacheDir(): string {
  const base = process.env.MAP_STORAGE_PATH ?? process.cwd();
  return join(base, ".watermarks");
}

/** Build a deterministic cache key for a watermarked image. */
export function buildCacheKey(
  fileHash: string,
  userId: string,
  datestamp: string,
  layerId: string
): string {
  return createHash("sha256")
    .update(
      `${fileHash}:${userId}:${datestamp}:${layerId}:${WATERMARK_VERSION}:${QIM_STEP}:${QIM_POSITIONS.map((p) => p.join("x")).join("|")}`
    )
    .digest("hex");
}

export function assertSecret(): void {
  if (!WATERMARK_SECRET) {
    throw new Error("WATERMARK_SECRET is not configured");
  }
}
