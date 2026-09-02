import {
  DATE_EPOCH,
  MAX_PAYLOAD_BITS,
  MAX_USERNAME_BYTES,
  SYNC_PATTERN,
  WATERMARK_SECRET,
  WATERMARK_VERSION,
} from "./config";
import { createKeyStream } from "./prng";

export interface WatermarkPayload {
  username: string;
  datestamp: string; // ISO date, e.g. "2026-09-02"
}

export interface EncodedPayload {
  bits: (0 | 1)[];
  encryptedPayloadBits: (0 | 1)[];
}

function bitsToNumber(bits: (0 | 1)[], bitCount: number): number {
  let value = 0;
  for (let i = 0; i < bitCount; i++) {
    value = (value << 1) | bits[i]!;
  }
  return value;
}

function numberToBits(value: number, bitCount: number): (0 | 1)[] {
  const bits: (0 | 1)[] = [];
  for (let i = bitCount - 1; i >= 0; i--) {
    bits.push(((value >>> i) & 1) as 0 | 1);
  }
  return bits;
}

/** CRC-16/CCITT-FALSE. Good enough to catch bit errors in the watermark. */
function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let _ = 0; _ < 8; _++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xffff;
    }
  }
  return crc;
}

export function datestampToDays(datestamp: string): number {
  const date = new Date(datestamp + "T00:00:00Z");
  const epoch = new Date(DATE_EPOCH + "T00:00:00Z");
  return Math.floor((date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysToDatestamp(days: number): string {
  const epoch = new Date(DATE_EPOCH + "T00:00:00Z");
  const date = new Date(epoch.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function encodePayload(
  payload: WatermarkPayload,
  context: { mapId: string; userId: string }
): EncodedPayload {
  const usernameBytes = new TextEncoder().encode(payload.username);
  if (usernameBytes.length > MAX_USERNAME_BYTES) {
    throw new Error("Username is too long to watermark");
  }

  const dateBits = numberToBits(datestampToDays(payload.datestamp), 32);

  const headerBits: (0 | 1)[] = [
    // version: 4 bits
    ...numberToBits(WATERMARK_VERSION, 4),
    // username length: 8 bits
    ...numberToBits(usernameBytes.length, 8),
  ];

  const usernameBits: (0 | 1)[] = [];
  for (const b of usernameBytes) {
    usernameBits.push(...numberToBits(b, 8));
  }

  const bodyBits: (0 | 1)[] = [...headerBits, ...usernameBits, ...dateBits];

  const bodyBytes = new Uint8Array(Math.ceil(bodyBits.length / 8));
  for (let i = 0; i < bodyBits.length; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    bodyBytes[byteIndex]! |= bodyBits[i]! << bitIndex;
  }
  const checksum = crc16(bodyBytes);
  const checksumBits: (0 | 1)[] = [];
  for (let i = 15; i >= 0; i--) {
    checksumBits.push(((checksum >>> i) & 1) as 0 | 1);
  }

  const payloadBits: (0 | 1)[] = [...bodyBits, ...checksumBits];

  // Encrypt payload bits (sync is left unencrypted so the decoder can align).
  const keyStream = createKeyStream(
    WATERMARK_SECRET,
    context.mapId,
    context.userId,
    payload.datestamp
  );
  const encryptedPayloadBits: (0 | 1)[] = payloadBits.map((bit) =>
    bit === keyStream() ? 0 : 1
  );

  // Pad to the fixed length used by the embedder/extractor so block assignment
  // is identical regardless of username length.
  while (encryptedPayloadBits.length < MAX_PAYLOAD_BITS) {
    encryptedPayloadBits.push(0);
  }

  return { bits: payloadBits, encryptedPayloadBits };
}

export function getEmbeddedBitStream(
  payload: WatermarkPayload,
  context: { mapId: string; userId: string }
): (0 | 1)[] {
  const { encryptedPayloadBits } = encodePayload(payload, context);
  return [...SYNC_PATTERN, ...encryptedPayloadBits];
}

export interface DecodedPayload {
  username: string;
  datestamp: string;
}

/**
 * Decode payload bits (already decrypted by the caller) back into username/date.
 */
export function decodePayloadBits(
  bits: (0 | 1)[]
): { payload: DecodedPayload; checksumValid: boolean } {
  let offset = 0;

  function take(n: number): (0 | 1)[] {
    const slice = bits.slice(offset, offset + n);
    offset += n;
    return slice;
  }

  const version = bitsToNumber(take(4), 4);
  if (version !== WATERMARK_VERSION) {
    throw new Error(`Unsupported watermark version ${version}`);
  }

  const usernameLength = bitsToNumber(take(8), 8);
  const usernameBits = take(usernameLength * 8);
  const usernameBytes = new Uint8Array(usernameLength);
  for (let i = 0; i < usernameLength; i++) {
    usernameBytes[i] = bitsToNumber(usernameBits.slice(i * 8, i * 8 + 8), 8);
  }
  const username = new TextDecoder().decode(usernameBytes);

  const dateDays = bitsToNumber(take(32), 32);
  const datestamp = daysToDatestamp(dateDays);

  const bodyBits = bits.slice(0, offset);
  const bodyBytes = new Uint8Array(Math.ceil(bodyBits.length / 8));
  for (let i = 0; i < bodyBits.length; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    bodyBytes[byteIndex]! |= bodyBits[i]! << bitIndex;
  }
  const expectedChecksum = crc16(bodyBytes);

  const actualChecksum = bitsToNumber(take(16), 16);

  return {
    payload: { username, datestamp },
    checksumValid: actualChecksum === expectedChecksum,
  };
}
