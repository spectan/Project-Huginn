import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAPS_DIR = path.join(__dirname, "..", "public", "maps");
const MASK_SIZE = 1024;

function isWaterPixel(r, g, b) {
  // Water in Wurm topography: blue is significantly dominant
  // Exclude pure black which may be artifacts/voids
  if (r === 0 && g === 0 && b === 0) return true;
  return b > r + 20 && b > g + 20;
}

async function generateWaterMask(topoPath, outputPath) {
  console.log(`Processing ${path.basename(topoPath)}...`);
  
  const img = sharp(topoPath);
  const { width, height } = await img.metadata();
  
  // Resize to mask size for performance
  const resized = await img
    .resize(MASK_SIZE, MASK_SIZE, { kernel: sharp.kernel.nearest })
    .raw()
    .toBuffer();
  
  // Create mask: land = transparent (0), water = opaque white (255)
  const mask = Buffer.alloc(MASK_SIZE * MASK_SIZE * 4);
  
  for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    const r = resized[srcIdx];
    const g = resized[srcIdx + 1];
    const b = resized[srcIdx + 2];
    
    if (isWaterPixel(r, g, b)) {
      // Water: opaque white
      mask[dstIdx] = 255;     // R
      mask[dstIdx + 1] = 255; // G
      mask[dstIdx + 2] = 255; // B
      mask[dstIdx + 3] = 255; // A
    } else {
      // Land: fully transparent
      mask[dstIdx] = 0;
      mask[dstIdx + 1] = 0;
      mask[dstIdx + 2] = 0;
      mask[dstIdx + 3] = 0;
    }
  }
  
  await sharp(mask, {
    raw: { width: MASK_SIZE, height: MASK_SIZE, channels: 4 }
  }).png().toFile(outputPath);
  
  const stats = fs.statSync(outputPath);
  console.log(`  Generated ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  const files = fs.readdirSync(MAPS_DIR)
    .filter(f => f.endsWith("-topo.png"))
    .sort();
  
  console.log(`Found ${files.length} topography maps\n`);
  
  for (const file of files) {
    const topoPath = path.join(MAPS_DIR, file);
    const maskName = file.replace("-topo.png", "-water-mask.png");
    const outputPath = path.join(MAPS_DIR, maskName);
    
    try {
      await generateWaterMask(topoPath, outputPath);
    } catch (error) {
      console.error(`  Failed: ${error.message}`);
    }
  }
  
  console.log("\nDone.");
}

main().catch(console.error);
