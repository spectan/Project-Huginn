import { createHash } from "crypto";
import { WATERMARK_SECRET, WATERMARK_VERSION } from "./config";

export interface ChipContext {
  mapId: string;
  layerId: string;
  userId: string;
}

/**
 * Derive the pseudorandom chip sign for a 16×16 spatial block.
 *
 * The sign is deterministic from the watermark secret, version, map, layer,
 * user, and block coordinates. It is independent of watermarkNumber so that
 * two users with the same numeric watermark still have uncorrelated patterns.
 */
export function getBlockChip(
  context: ChipContext,
  bx: number,
  by: number
): 1 | -1 {
  const hash = createHash("sha256")
    .update(
      `${WATERMARK_SECRET}:watermark-chip:${WATERMARK_VERSION}:${context.mapId}:${context.layerId}:${context.userId}:${bx}:${by}`
    )
    .digest();
  return (hash[0]! & 1) ? 1 : -1;
}

/**
 * Generate the full chip pattern for the original image block grid.
 */
export function createChipPattern(
  context: ChipContext,
  blocksW: number,
  blocksH: number
): Int8Array {
  const chips = new Int8Array(blocksW * blocksH);
  for (let by = 0; by < blocksH; by++) {
    for (let bx = 0; bx < blocksW; bx++) {
      chips[by * blocksW + bx] = getBlockChip(context, bx, by);
    }
  }
  return chips;
}
