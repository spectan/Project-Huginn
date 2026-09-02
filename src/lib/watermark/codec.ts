import { createHash } from "crypto";
import { PAYLOAD_BITS, SYNC_PATTERN, WATERMARK_SECRET } from "./config";

/**
 * Derive the deterministic payload bits for a (mapId, userId) pair.
 *
 * The reveal process will brute-force known users and look for a matching
 * payload; 16 bits is enough to make accidental false positives unlikely
 * (~1/65k per candidate) while keeping each bit's samples numerous.
 */
export function getUserPayloadBits(
  mapId: string,
  userId: string
): (0 | 1)[] {
  const hash = createHash("sha256")
    .update(`${WATERMARK_SECRET}:${mapId}:${userId}`)
    .digest("hex");

  const bits: (0 | 1)[] = [];
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    bits.push(parseInt(hash[i]!, 16) % 2 === 0 ? 0 : 1);
  }
  return bits;
}

/**
 * Full bit stream: known sync pattern followed by the user payload bits.
 */
export function getEmbeddedBitStream(
  mapId: string,
  userId: string
): (0 | 1)[] {
  const payloadBits = getUserPayloadBits(mapId, userId);
  return [...SYNC_PATTERN, ...payloadBits];
}
