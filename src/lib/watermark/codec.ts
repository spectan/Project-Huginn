import { PAYLOAD_BITS, SYNC_PATTERN } from "./config";

/**
 * Encode a user watermark number as the payload bits.
 *
 * The reveal process brute-forces known users by their watermark number.
 * 16 bits supports up to 65,535 users; the app caps the assignment at 9,999.
 */
export function getUserPayloadBits(
  watermarkNumber: number
): (0 | 1)[] {
  const bits: (0 | 1)[] = [];
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    const bit = (watermarkNumber >> (PAYLOAD_BITS - 1 - i)) & 1;
    bits.push(bit === 1 ? 1 : 0);
  }
  return bits;
}

/**
 * Full bit stream: known sync pattern followed by the user payload bits.
 */
export function getEmbeddedBitStream(
  watermarkNumber: number
): (0 | 1)[] {
  const payloadBits = getUserPayloadBits(watermarkNumber);
  return [...SYNC_PATTERN, ...payloadBits];
}
