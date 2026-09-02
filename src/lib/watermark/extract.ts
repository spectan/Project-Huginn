import sharp from "sharp";
import {
  BLOCK_SIZE,
  QIM_POSITIONS,
  QIM_STEP,
  SYNC_LENGTH,
  SYNC_PATTERN,
  TOTAL_EMBEDDED_BITS,
  WATERMARK_SECRET,
  assertSecret,
} from "./config";
import { decodePayloadBits, type DecodedPayload } from "./codec";
import { forwardDCT2D } from "./dct";
import { createKeyStream } from "./prng";

export interface ExtractContext {
  mapId: string;
  userId: string;
  datestamp: string;
}

export interface ExtractResult {
  found: boolean;
  payload: DecodedPayload | null;
  confidence: number;
  syncConfidence: number;
  checksumValid: boolean;
}

function decodeBitFromCoefficient(value: number): 0 | 1 {
  const step = QIM_STEP;
  const dist0 = Math.abs(value - Math.round(value / (2 * step)) * (2 * step));
  const dist1 = Math.abs(
    value -
      (Math.round((value - step) / (2 * step)) * (2 * step) + step)
  );
  return dist1 < dist0 ? 1 : 0;
}

export async function extractWatermark(
  imageBuffer: Buffer,
  context: ExtractContext
): Promise<ExtractResult> {
  assertSecret();

  const { width, height } = await sharp(imageBuffer).metadata();
  if (width === undefined || height === undefined) {
    return { found: false, payload: null, confidence: 0, syncConfidence: 0, checksumValid: false };
  }

  const { data } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = 4;
  const pixelCount = width * height;
  const luma = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    luma[i] =
      0.299 * data[i * channels]! +
      0.587 * data[i * channels + 1]! +
      0.114 * data[i * channels + 2]!;
  }

  const paddedW = Math.ceil(width / BLOCK_SIZE) * BLOCK_SIZE;
  const paddedH = Math.ceil(height / BLOCK_SIZE) * BLOCK_SIZE;
  const blocksW = paddedW / BLOCK_SIZE;
  const blocksH = paddedH / BLOCK_SIZE;
  const totalBlocks = blocksW * blocksH;

  const bitsToExtract = TOTAL_EMBEDDED_BITS;

  // Votes per bit.
  const votesForOne = new Int32Array(bitsToExtract);
  const votesForZero = new Int32Array(bitsToExtract);

  const blockBuffer = new Float64Array(64);

  for (let b = 0; b < totalBlocks; b++) {
    const bx = b % blocksW;
    const by = Math.floor(b / blocksW);

    for (let y = 0; y < BLOCK_SIZE; y++) {
      const srcY = by * BLOCK_SIZE + y;
      for (let x = 0; x < BLOCK_SIZE; x++) {
        const srcX = bx * BLOCK_SIZE + x;
        const idx = srcY * width + srcX;
        blockBuffer[y * BLOCK_SIZE + x] =
          srcX < width && srcY < height ? luma[idx]! : 128;
      }
    }

    const dct = forwardDCT2D(blockBuffer);

    const bitIndex = b % bitsToExtract;
    const positionIndex = Math.floor(b / bitsToExtract) % QIM_POSITIONS.length;
    const [u, v] = QIM_POSITIONS[positionIndex]!;
    const coeffIndex = v * BLOCK_SIZE + u;

    const bit = decodeBitFromCoefficient(dct[coeffIndex]!);
    if (bit === 1) {
      votesForOne[bitIndex]!++;
    } else {
      votesForZero[bitIndex]!++;
    }
  }

  const extractedBits: (0 | 1)[] = [];
  for (let i = 0; i < bitsToExtract; i++) {
    extractedBits.push(votesForOne[i]! > votesForZero[i]! ? 1 : 0);
  }

  const syncBits = extractedBits.slice(0, SYNC_LENGTH);
  let syncMatches = 0;
  for (let i = 0; i < SYNC_LENGTH; i++) {
    if (syncBits[i]! === SYNC_PATTERN[i]!) syncMatches++;
  }
  const syncConfidence = syncMatches / SYNC_LENGTH;

  if (syncConfidence < 0.6) {
    return {
      found: false,
      payload: null,
      confidence: syncConfidence,
      syncConfidence,
      checksumValid: false,
    };
  }

  const keyStream = createKeyStream(
    WATERMARK_SECRET,
    context.mapId,
    context.userId,
    context.datestamp
  );

  const encryptedPayloadBits: (0 | 1)[] = [];
  for (let i = SYNC_LENGTH; i < bitsToExtract; i++) {
    encryptedPayloadBits.push((extractedBits[i]! ^ keyStream()) as 0 | 1);
  }

  try {
    const { payload, checksumValid } = decodePayloadBits(encryptedPayloadBits);
    const confidence = syncConfidence * (checksumValid ? 1 : 0.5);
    return {
      found: true,
      payload,
      confidence,
      syncConfidence,
      checksumValid,
    };
  } catch {
    return {
      found: false,
      payload: null,
      confidence: syncConfidence,
      syncConfidence,
      checksumValid: false,
    };
  }
}

export async function tryExtractWatermark(
  imageBuffer: Buffer,
  context: { mapId: string; userId: string }
): Promise<ExtractResult> {
  const today = new Date();
  const candidates: ExtractResult[] = [];

  for (let offsetDays = 0; offsetDays <= 7; offsetDays++) {
    const date = new Date(today.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    const datestamp = date.toISOString().slice(0, 10);
    const result = await extractWatermark(imageBuffer, {
      ...context,
      datestamp,
    });
    candidates.push(result);
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? {
    found: false,
    payload: null, confidence: 0, syncConfidence: 0, checksumValid: false,
  };
}
