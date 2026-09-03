import { createHash } from "crypto";
import { PAYLOAD_BITS, SYNC_PATTERN, WATERMARK_SECRET, WATERMARK_VERSION } from "./config";

/**
 * Encode a user watermark number as the payload bits.
 *
 * The payload is a 16-bit pseudorandom codeword derived from the watermark
 * secret and the user's watermark number. Using a random mapping (instead of
 * the raw binary representation) means adjacent watermark numbers have
 * uncorrelated bits, which improves the confidence margin between candidates
 * at low resolutions.
 */
export function getUserPayloadBits(
  watermarkNumber: number
): (0 | 1)[] {
  const bits: (0 | 1)[] = [];
  const base = `${WATERMARK_SECRET}:watermark-payload:${WATERMARK_VERSION}:${watermarkNumber}`;
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    const hash = createHash("sha256")
      .update(`${base}:${i}`)
      .digest();
    bits.push((hash[0]! & 1) as 0 | 1);
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
