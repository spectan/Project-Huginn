import { createHash } from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { forwardDCT2D, inverseDCT2D } from "../../src/lib/watermark/dct";
import { hashStringToSeed, mulberry32 } from "../../src/lib/watermark/prng";

const SECRET = process.env.WATERMARK_SECRET ?? "test-secret";
const BLOCK_SIZE = 8;
const PAYLOAD_BITS = 32;
const ALPHA = 3.0;
const MIDFREQ_INDICES = [9, 10, 11, 12, 17, 18, 19, 20, 25, 26, 27, 28, 33, 34, 35, 36];

type Context = {
  mapId: string;
  userId: string;
};

function hashPayloadToBits({ mapId, userId }: Context): (0 | 1)[] {
  const hash = createHash("sha256")
    .update(`${SECRET}:${mapId}:${userId}`)
    .digest("hex");
  const bits: (0 | 1)[] = [];
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    bits.push(parseInt(hash[i]!, 16) % 2 === 0 ? 0 : 1);
  }
  return bits;
}

function makePrng(seedStr: string) {
  return mulberry32(hashStringToSeed(seedStr));
}

async function loadImageGray(path: string | Buffer): Promise<{ data: Float64Array; width: number; height: number }> {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const out = new Float64Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i]!;
  }
  return { data: out, width, height };
}

function getBlock(img: Float64Array, width: number, bx: number, by: number): Float64Array {
  const block = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  for (let y = 0; y < BLOCK_SIZE; y++) {
    for (let x = 0; x < BLOCK_SIZE; x++) {
      block[y * BLOCK_SIZE + x] = img[(by * BLOCK_SIZE + y) * width + (bx * BLOCK_SIZE + x)]!;
    }
  }
  return block;
}

function putBlock(img: Float64Array, width: number, bx: number, by: number, block: Float64Array): void {
  for (let y = 0; y < BLOCK_SIZE; y++) {
    for (let x = 0; x < BLOCK_SIZE; x++) {
      img[(by * BLOCK_SIZE + y) * width + (bx * BLOCK_SIZE + x)] = block[y * BLOCK_SIZE + x]!;
    }
  }
}

function embedBit(
  img: Float64Array,
  width: number,
  height: number,
  bitIndex: number,
  bit: 0 | 1,
  seedStr: string
): void {
  const rng = makePrng(seedStr);
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  for (let b = bitIndex; b < totalBlocks; b += PAYLOAD_BITS) {
    const bx = b % blocksX;
    const by = Math.floor(b / blocksX);
    const block = getBlock(img, width, bx, by);
    const dct = forwardDCT2D(block);
    const sign = bit === 1 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const ci = MIDFREQ_INDICES[Math.floor(rng() * MIDFREQ_INDICES.length)]!;
      dct[ci] = dct[ci]! + sign * ALPHA;
    }
    const idct = inverseDCT2D(dct);
    putBlock(img, width, bx, by, idct);
  }
}

async function embed(path: string, context: Context): Promise<Buffer> {
  const { data: img, width, height } = await loadImageGray(path);
  const bits = hashPayloadToBits(context);

  for (let i = 0; i < PAYLOAD_BITS; i++) {
    embedBit(img, width, height, i, bits[i]!, `${context.mapId}:${context.userId}:bit:${i}`);
  }

  const clamped = Buffer.alloc(width * height);
  for (let i = 0; i < img.length; i++) {
    const v = Math.round(img[i]!);
    clamped[i] = Math.max(0, Math.min(255, v));
  }

  return sharp(clamped, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

function extractBit(
  img: Float64Array,
  width: number,
  height: number,
  bitIndex: number,
  seedStr: string
): number {
  const rng = makePrng(seedStr);
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  let sum = 0;
  let count = 0;
  for (let b = bitIndex; b < totalBlocks; b += PAYLOAD_BITS) {
    const bx = b % blocksX;
    const by = Math.floor(b / blocksX);
    const block = getBlock(img, width, bx, by);
    const dct = forwardDCT2D(block);
    for (let k = 0; k < 4; k++) {
      const ci = MIDFREQ_INDICES[Math.floor(rng() * MIDFREQ_INDICES.length)]!;
      sum += dct[ci]!;
      count++;
    }
  }
  return sum / count;
}

async function extract(pathOrBuffer: string | Buffer, context: Context): Promise<{
  bits: (0 | 1)[];
  correlation: number;
  confidence: number;
}> {
  const { data: img, width, height } = await loadImageGray(pathOrBuffer);
  const expectedBits = hashPayloadToBits(context);
  const correlations: number[] = [];

  for (let i = 0; i < PAYLOAD_BITS; i++) {
    const seedStr = `${context.mapId}:${context.userId}:bit:${i}`;
    const mean = extractBit(img, width, height, i, seedStr);
    correlations.push(mean);
  }

  const bits: (0 | 1)[] = correlations.map((c) => (c > 0 ? 1 : 0));
  let correct = 0;
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    if (bits[i] === expectedBits[i]) correct++;
  }
  const confidence = correct / PAYLOAD_BITS;
  const correlation = correlations.reduce((a, b) => a + Math.abs(b), 0) / correlations.length;

  return { bits, correlation, confidence };
}

async function computePsnr(originalPath: string, watermarkedBuffer: Buffer): Promise<number> {
  const orig = await loadImageGray(originalPath);
  const wm = await sharp(watermarkedBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let mse = 0;
  for (let i = 0; i < orig.data.length; i++) {
    const diff = orig.data[i]! - wm.data[i]!;
    mse += diff * diff;
  }
  mse /= orig.data.length;
  return 10 * Math.log10((255 * 255) / mse);
}

async function main() {
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");
  if (!existsSync(samplePath)) {
    console.log("Sample not found");
    return;
  }

  const context: Context = {
    mapId: "map-celebration",
    userId: "user-abc",
  };

  console.log("Embedding...");
  const watermarked = await embed(samplePath, context);
  console.log("PSNR:", (await computePsnr(samplePath, watermarked)).toFixed(2), "dB");
  await sharp(watermarked).toFile("/tmp/wm_spread.png");

  console.log("\nRaw PNG extraction:");
  const raw = await extract("/tmp/wm_spread.png", context);
  console.log(`  confidence=${raw.confidence.toFixed(2)}, correlation=${raw.correlation.toFixed(4)}`);

  console.log("\nJPEG 80:");
  const jpeg80 = await sharp("/tmp/wm_spread.png").jpeg({ quality: 80 }).toBuffer();
  const r80 = await extract(jpeg80, context);
  console.log(`  confidence=${r80.confidence.toFixed(2)}, correlation=${r80.correlation.toFixed(4)}`);

  console.log("\nJPEG 90:");
  const jpeg90 = await sharp("/tmp/wm_spread.png").jpeg({ quality: 90 }).toBuffer();
  const r90 = await extract(jpeg90, context);
  console.log(`  confidence=${r90.confidence.toFixed(2)}, correlation=${r90.correlation.toFixed(4)}`);

  const meta = await sharp("/tmp/wm_spread.png").metadata();
  const width = meta.width!;
  const height = meta.height!;

  console.log("\n75% center crop:");
  const crop75W = Math.floor(width * 0.75);
  const crop75H = Math.floor(height * 0.75);
  const left75 = Math.floor((width - crop75W) / 2);
  const top75 = Math.floor((height - crop75H) / 2);
  const cropped75 = await sharp("/tmp/wm_spread.png")
    .extract({ left: left75, top: top75, width: crop75W, height: crop75H })
    .png()
    .toBuffer();
  const rc75 = await extract(cropped75, context);
  console.log(`  confidence=${rc75.confidence.toFixed(2)}, correlation=${rc75.correlation.toFixed(4)}`);

  console.log("\n25% center crop:");
  const crop25W = Math.floor(width * 0.25);
  const crop25H = Math.floor(height * 0.25);
  const left25 = Math.floor((width - crop25W) / 2);
  const top25 = Math.floor((height - crop25H) / 2);
  const cropped25 = await sharp("/tmp/wm_spread.png")
    .extract({ left: left25, top: top25, width: crop25W, height: crop25H })
    .png()
    .toBuffer();
  const rc25 = await extract(cropped25, context);
  console.log(`  confidence=${rc25.confidence.toFixed(2)}, correlation=${rc25.correlation.toFixed(4)}`);

  console.log("\n50% center crop:");
  const cropW = Math.floor(width * 0.5);
  const cropH = Math.floor(height * 0.5);
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);
  const cropped = await sharp("/tmp/wm_spread.png")
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();
  await sharp(cropped).toFile("/tmp/wm_crop.png");
  const rc = await extract(cropped, context);
  console.log(`  confidence=${rc.confidence.toFixed(2)}, correlation=${rc.correlation.toFixed(4)}`);

  console.log("\n50% center crop then JPEG 80:");
  const cropJpeg = await sharp(cropped).jpeg({ quality: 80 }).toBuffer();
  const rcj = await extract(cropJpeg, context);
  console.log(`  confidence=${rcj.confidence.toFixed(2)}, correlation=${rcj.correlation.toFixed(4)}`);
}

main().catch(console.error);
