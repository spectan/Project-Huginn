import { createHash } from "crypto";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { forwardDCT2D, inverseDCT2D } from "../../src/lib/watermark/dct";
import { hashStringToSeed, mulberry32 } from "../../src/lib/watermark/prng";

const SECRET = process.env.WATERMARK_SECRET ?? "test-secret";
const BLOCK_SIZE = 8;
const MIDFREQ_INDICES = [9, 10, 11, 12, 17, 18, 19, 20, 25, 26, 27, 28, 33, 34, 35, 36];

const PAYLOAD_BITS_OPTIONS = [16, 20, 24, 32];
const ALPHA_OPTIONS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];
const COEFFS_PER_BLOCK_OPTIONS = [1, 2, 4, 8];

const IMAGE_PATH = join(process.cwd(), "public", "maps", "celebration-terrain.png");
const OUTPUT_JSON = "/tmp/watermark-alpha-results.json";

const CONTEXT = {
  mapId: "map-celebration",
  userId: "user-abc",
};

function hashPayloadToBits(payloadBits: number): (0 | 1)[] {
  const hash = createHash("sha256")
    .update(`${SECRET}:${CONTEXT.mapId}:${CONTEXT.userId}`)
    .digest("hex");
  const bits: (0 | 1)[] = [];
  for (let i = 0; i < payloadBits; i++) {
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
  seedStr: string,
  payloadBits: number,
  alpha: number,
  coeffsPerBlock: number
): void {
  const rng = makePrng(seedStr);
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  for (let b = bitIndex; b < totalBlocks; b += payloadBits) {
    const bx = b % blocksX;
    const by = Math.floor(b / blocksX);
    const block = getBlock(img, width, bx, by);
    const dct = forwardDCT2D(block);
    const sign = bit === 1 ? 1 : -1;
    for (let k = 0; k < coeffsPerBlock; k++) {
      const ci = MIDFREQ_INDICES[Math.floor(rng() * MIDFREQ_INDICES.length)]!;
      dct[ci] = dct[ci]! + sign * alpha;
    }
    const idct = inverseDCT2D(dct);
    putBlock(img, width, bx, by, idct);
  }
}

async function embed(
  path: string,
  payloadBits: number,
  alpha: number,
  coeffsPerBlock: number
): Promise<Buffer> {
  const { data: img, width, height } = await loadImageGray(path);
  const bits = hashPayloadToBits(payloadBits);

  for (let i = 0; i < payloadBits; i++) {
    const seedStr = `${CONTEXT.mapId}:${CONTEXT.userId}:bit:${i}`;
    embedBit(img, width, height, i, bits[i]!, seedStr, payloadBits, alpha, coeffsPerBlock);
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
  seedStr: string,
  payloadBits: number,
  coeffsPerBlock: number
): number {
  const rng = makePrng(seedStr);
  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  let sum = 0;
  let count = 0;
  for (let b = bitIndex; b < totalBlocks; b += payloadBits) {
    const bx = b % blocksX;
    const by = Math.floor(b / blocksX);
    const block = getBlock(img, width, bx, by);
    const dct = forwardDCT2D(block);
    for (let k = 0; k < coeffsPerBlock; k++) {
      const ci = MIDFREQ_INDICES[Math.floor(rng() * MIDFREQ_INDICES.length)]!;
      sum += dct[ci]!;
      count++;
    }
  }
  return sum / count;
}

async function extract(
  pathOrBuffer: string | Buffer,
  payloadBits: number,
  coeffsPerBlock: number
): Promise<{
  bits: (0 | 1)[];
  correlation: number;
  confidence: number;
}> {
  const { data: img, width, height } = await loadImageGray(pathOrBuffer);
  const expectedBits = hashPayloadToBits(payloadBits);
  const correlations: number[] = [];

  for (let i = 0; i < payloadBits; i++) {
    const seedStr = `${CONTEXT.mapId}:${CONTEXT.userId}:bit:${i}`;
    const mean = extractBit(img, width, height, i, seedStr, payloadBits, coeffsPerBlock);
    correlations.push(mean);
  }

  const bits: (0 | 1)[] = correlations.map((c) => (c > 0 ? 1 : 0));
  let correct = 0;
  for (let i = 0; i < payloadBits; i++) {
    if (bits[i] === expectedBits[i]) correct++;
  }
  const confidence = correct / payloadBits;
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

async function centerCrop(buffer: Buffer, ratio: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const cropW = Math.floor(width * ratio);
  const cropH = Math.floor(height * ratio);
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);
  return sharp(buffer).extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
}

async function centerCropSize(buffer: Buffer, cropW: number, cropH: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);
  return sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();
}

async function jpegQuality(buffer: Buffer, quality: number): Promise<Buffer> {
  return sharp(buffer).jpeg({ quality }).toBuffer();
}

type AttackResult = {
  name: string;
  confidence: number;
  correlation: number;
};

type ConfigResult = {
  payloadBits: number;
  alpha: number;
  coeffsPerBlock: number;
  blockAssignment: "interleaved";
  psnr: number;
  attacks: AttackResult[];
  rawConfidence: number;
  jpeg90Confidence: number;
  jpeg80Confidence: number;
  crop50Confidence: number;
  crop50Jpeg80Confidence: number;
  crop25Confidence: number;
  passesThreshold: boolean;
};

async function runConfig(
  payloadBits: number,
  alpha: number,
  coeffsPerBlock: number
): Promise<ConfigResult> {
  const watermarked = await embed(IMAGE_PATH, payloadBits, alpha, coeffsPerBlock);
  const psnr = await computePsnr(IMAGE_PATH, watermarked);

  const attacks: AttackResult[] = [];

  // Raw PNG
  const raw = await extract(watermarked, payloadBits, coeffsPerBlock);
  attacks.push({ name: "raw-png", confidence: raw.confidence, correlation: raw.correlation });

  if (raw.confidence < 1.0) {
    return {
      payloadBits,
      alpha,
      coeffsPerBlock,
      blockAssignment: "interleaved",
      psnr,
      attacks,
      rawConfidence: raw.confidence,
      jpeg90Confidence: 0,
      jpeg80Confidence: 0,
      crop50Confidence: 0,
      crop50Jpeg80Confidence: 0,
      crop25Confidence: 0,
      passesThreshold: false,
    };
  }

  // JPEG 90
  const jpeg90Buf = await jpegQuality(watermarked, 90);
  const jpeg90 = await extract(jpeg90Buf, payloadBits, coeffsPerBlock);
  attacks.push({ name: "jpeg-90", confidence: jpeg90.confidence, correlation: jpeg90.correlation });

  // JPEG 80
  const jpeg80Buf = await jpegQuality(watermarked, 80);
  const jpeg80 = await extract(jpeg80Buf, payloadBits, coeffsPerBlock);
  attacks.push({ name: "jpeg-80", confidence: jpeg80.confidence, correlation: jpeg80.correlation });

  // 50% center crop
  const crop50 = await centerCrop(watermarked, 0.5);
  const crop50res = await extract(crop50, payloadBits, coeffsPerBlock);
  attacks.push({
    name: "crop-50",
    confidence: crop50res.confidence,
    correlation: crop50res.correlation,
  });

  // 50% crop + JPEG 80
  const crop50jpeg80 = await jpegQuality(crop50, 80);
  const crop50jpeg80res = await extract(crop50jpeg80, payloadBits, coeffsPerBlock);
  attacks.push({
    name: "crop-50-jpeg-80",
    confidence: crop50jpeg80res.confidence,
    correlation: crop50jpeg80res.correlation,
  });

  // 25% center crop
  const crop25 = await centerCrop(watermarked, 0.25);
  const crop25res = await extract(crop25, payloadBits, coeffsPerBlock);
  attacks.push({
    name: "crop-25",
    confidence: crop25res.confidence,
    correlation: crop25res.correlation,
  });

  const passesThreshold =
    raw.confidence >= 1.0 &&
    jpeg90.confidence >= 1.0 &&
    crop50res.confidence >= 0.95;

  return {
    payloadBits,
    alpha,
    coeffsPerBlock,
    blockAssignment: "interleaved",
    psnr,
    attacks,
    rawConfidence: raw.confidence,
    jpeg90Confidence: jpeg90.confidence,
    jpeg80Confidence: jpeg80.confidence,
    crop50Confidence: crop50res.confidence,
    crop50Jpeg80Confidence: crop50jpeg80res.confidence,
    crop25Confidence: crop25res.confidence,
    passesThreshold,
  };
}

async function runExtraAttacks(
  payloadBits: number,
  alpha: number,
  coeffsPerBlock: number
): Promise<AttackResult[]> {
  const watermarked = await embed(IMAGE_PATH, payloadBits, alpha, coeffsPerBlock);
  const attacks: AttackResult[] = [];

  // 10% center crop
  const crop10 = await centerCrop(watermarked, 0.1);
  const crop10res = await extract(crop10, payloadBits, coeffsPerBlock);
  attacks.push({ name: "crop-10", confidence: crop10res.confidence, correlation: crop10res.correlation });

  // 5% center crop
  const crop5 = await centerCrop(watermarked, 0.05);
  const crop5res = await extract(crop5, payloadBits, coeffsPerBlock);
  attacks.push({ name: "crop-5", confidence: crop5res.confidence, correlation: crop5res.correlation });

  // 235x167 crop
  const cropSam = await centerCropSize(watermarked, 235, 167);
  const cropSamRes = await extract(cropSam, payloadBits, coeffsPerBlock);
  attacks.push({
    name: "crop-235x167",
    confidence: cropSamRes.confidence,
    correlation: cropSamRes.correlation,
  });

  return attacks;
}

function formatConfidence(c: number): string {
  return (c * 100).toFixed(1) + "%";
}

async function main() {
  if (!existsSync(IMAGE_PATH)) {
    console.error("Image not found:", IMAGE_PATH);
    process.exit(1);
  }

  const results: ConfigResult[] = [];
  let completed = 0;
  const total = PAYLOAD_BITS_OPTIONS.length * ALPHA_OPTIONS.length * COEFFS_PER_BLOCK_OPTIONS.length;

  for (const payloadBits of PAYLOAD_BITS_OPTIONS) {
    for (const alpha of ALPHA_OPTIONS) {
      for (const coeffsPerBlock of COEFFS_PER_BLOCK_OPTIONS) {
        completed++;
        process.stdout.write(`[${completed}/${total}] bits=${payloadBits} alpha=${alpha.toFixed(1)} coeffs=${coeffsPerBlock} ... `);
        const start = Date.now();
        const result = await runConfig(payloadBits, alpha, coeffsPerBlock);
        const elapsed = Date.now() - start;
        results.push(result);
        const status = result.rawConfidence < 1.0
          ? `early-stop raw=${formatConfidence(result.rawConfidence)}`
          : `PSNR=${result.psnr.toFixed(2)}dB raw=${formatConfidence(result.rawConfidence)} j90=${formatConfidence(result.jpeg90Confidence)} j80=${formatConfidence(result.jpeg80Confidence)} c50=${formatConfidence(result.crop50Confidence)} c50j80=${formatConfidence(result.crop50Jpeg80Confidence)} c25=${formatConfidence(result.crop25Confidence)}`;
        console.log(`${status} (${elapsed}ms)`);
      }
    }
  }

  // Rank by PSNR among configs that pass the threshold.
  const passing = results.filter((r) => r.passesThreshold).sort((a, b) => b.psnr - a.psnr);

  let bestExtra: AttackResult[] | undefined;
  let bestConfig: ConfigResult | undefined;

  if (passing.length > 0) {
    bestConfig = passing[0]!;
    console.log(`\nRunning extra attacks on best config: bits=${bestConfig.payloadBits} alpha=${bestConfig.alpha} coeffs=${bestConfig.coeffsPerBlock}`);
    bestExtra = await runExtraAttacks(bestConfig.payloadBits, bestConfig.alpha, bestConfig.coeffsPerBlock);
    for (const a of bestExtra) {
      console.log(`  ${a.name}: ${formatConfidence(a.confidence)} (correlation=${a.correlation.toFixed(4)})`);
    }
  }

  const summary = {
    image: IMAGE_PATH,
    secretSample: `${SECRET.slice(0, 3)}...`,
    context: CONTEXT,
    totalConfigs: total,
    earlyStopped: results.filter((r) => r.rawConfidence < 1.0).length,
    passingConfigs: passing.length,
    bestConfig: bestConfig
      ? {
          payloadBits: bestConfig.payloadBits,
          alpha: bestConfig.alpha,
          coeffsPerBlock: bestConfig.coeffsPerBlock,
          blockAssignment: bestConfig.blockAssignment,
          psnr: bestConfig.psnr,
          rawConfidence: bestConfig.rawConfidence,
          jpeg90Confidence: bestConfig.jpeg90Confidence,
          jpeg80Confidence: bestConfig.jpeg80Confidence,
          crop50Confidence: bestConfig.crop50Confidence,
          crop50Jpeg80Confidence: bestConfig.crop50Jpeg80Confidence,
          crop25Confidence: bestConfig.crop25Confidence,
          extraAttacks: bestExtra,
        }
      : null,
    allResults: results,
    top5: passing.slice(0, 5).map((r) => ({
      payloadBits: r.payloadBits,
      alpha: r.alpha,
      coeffsPerBlock: r.coeffsPerBlock,
      blockAssignment: r.blockAssignment,
      psnr: r.psnr,
      rawConfidence: r.rawConfidence,
      jpeg90Confidence: r.jpeg90Confidence,
      jpeg80Confidence: r.jpeg80Confidence,
      crop50Confidence: r.crop50Confidence,
      crop50Jpeg80Confidence: r.crop50Jpeg80Confidence,
      crop25Confidence: r.crop25Confidence,
    })),
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`\nWrote JSON summary to ${OUTPUT_JSON}`);

  // Print top 5 markdown table.
  console.log("\n## Top 5 configs (best PSNR, 100% raw + 100% JPEG 90 + ≥95% 50% crop)\n");
  console.log("| payloadBits | alpha | coeffs/block | PSNR (dB) | raw | JPEG 90 | JPEG 80 | crop 50% | crop 50% + J80 | crop 25% |");
  console.log("|------------:|------:|-------------:|----------:|----:|--------:|--------:|---------:|--------------:|---------:|");
  for (const r of passing.slice(0, 5)) {
    console.log(
      `| ${r.payloadBits} | ${r.alpha.toFixed(1)} | ${r.coeffsPerBlock} | ${r.psnr.toFixed(2)} | ${formatConfidence(r.rawConfidence)} | ${formatConfidence(r.jpeg90Confidence)} | ${formatConfidence(r.jpeg80Confidence)} | ${formatConfidence(r.crop50Confidence)} | ${formatConfidence(r.crop50Jpeg80Confidence)} | ${formatConfidence(r.crop25Confidence)} |`
    );
  }

  if (bestConfig) {
    const survives25 = bestConfig.crop25Confidence >= 1.0;
    console.log(`\n**Absolute best config:** ${bestConfig.payloadBits} bits, alpha=${bestConfig.alpha}, coeffs/block=${bestConfig.coeffsPerBlock}, PSNR=${bestConfig.psnr.toFixed(2)} dB`);
    console.log(`**25% crop survival:** ${formatConfidence(bestConfig.crop25Confidence)} (${survives25 ? "reliable" : "not reliable"})`);
  } else {
    console.log("\n**No config passed the threshold.**");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
