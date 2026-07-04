import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAPS_DIR = path.join(__dirname, "..", "public", "maps");

function isWaterPixel(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return true;
  return b > r + 20 && b > g + 20;
}

async function generateWaterMask(topoPath, outputPath) {
  console.log(`Processing ${path.basename(topoPath)}...`);

  const img = sharp(topoPath);
  const { width, height } = await img.metadata();

  const raw = await img.raw().toBuffer();

  const mask = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    const r = raw[srcIdx];
    const g = raw[srcIdx + 1];
    const b = raw[srcIdx + 2];

    if (isWaterPixel(r, g, b)) {
      mask[dstIdx] = 255;
      mask[dstIdx + 1] = 255;
      mask[dstIdx + 2] = 255;
      mask[dstIdx + 3] = 255;
    } else {
      mask[dstIdx] = 0;
      mask[dstIdx + 1] = 0;
      mask[dstIdx + 2] = 0;
      mask[dstIdx + 3] = 0;
    }
  }

  await sharp(mask, {
    raw: { width, height, channels: 4 }
  }).png().toFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`  Generated ${path.basename(outputPath)} ${width}x${height} (${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  const files = fs.readdirSync(MAPS_DIR)
    .filter(f => f.endsWith(".png") && !f.endsWith("-water-mask.png") && f !== "wurm-map.png")
    .sort();

  console.log(`Found ${files.length} map images\n`);

  for (const file of files) {
    const mapPath = path.join(MAPS_DIR, file);
    const maskName = file.replace(".png", "-water-mask.png");
    const outputPath = path.join(MAPS_DIR, maskName);

    try {
      await generateWaterMask(mapPath, outputPath);
    } catch (error) {
      console.error(`  Failed: ${error.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
