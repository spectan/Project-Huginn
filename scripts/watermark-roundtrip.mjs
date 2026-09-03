import { readFile } from "fs/promises";
import { join } from "path";

process.env.WATERMARK_SECRET = "test-watermark-secret-do-not-use-in-prod";

const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");
const originalBuffer = await readFile(samplePath);

const { embedWatermark } = await import("../src/lib/watermark/embed.js");
const { tryExtractWatermark } = await import("../src/lib/watermark/extract.js");
const sharp = (await import("sharp")).default;

const context = {
  mapId: "map-celebration",
  userId: "user-abc",
  watermarkNumber: 1,
  layerId: "layer-terrain",
};

console.log("Embedding watermark...");
const watermarked = await embedWatermark(samplePath, context, { cache: false });
console.log("Watermarked size:", watermarked.length);

console.log("Extracting raw...");
const result = await tryExtractWatermark(watermarked, {
  mapId: context.mapId,
  layerId: context.layerId,
  originalImageBuffer: originalBuffer,
  candidates: [
    { userId: context.userId, watermarkNumber: context.watermarkNumber },
    { userId: "user-other", watermarkNumber: 2 },
  ],
});
console.log("Raw result:", result);

console.log("Extracting 50% downscale...");
const scaled = await sharp(watermarked).resize(1024, 1024, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
const scaledResult = await tryExtractWatermark(scaled, {
  mapId: context.mapId,
  layerId: context.layerId,
  originalImageBuffer: originalBuffer,
  candidates: [
    { userId: context.userId, watermarkNumber: context.watermarkNumber },
    { userId: "user-other", watermarkNumber: 2 },
  ],
});
console.log("Scaled result:", scaledResult);

console.log("Extracting 50% center crop...");
const { width = 1, height = 1 } = await sharp(watermarked).metadata();
const cropWidth = Math.floor(width * 0.5);
const cropHeight = Math.floor(height * 0.5);
const left = Math.floor((width - cropWidth) / 2);
const top = Math.floor((height - cropHeight) / 2);
const cropped = await sharp(watermarked).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
const cropResult = await tryExtractWatermark(cropped, {
  mapId: context.mapId,
  layerId: context.layerId,
  originalImageBuffer: originalBuffer,
  candidates: [
    { userId: context.userId, watermarkNumber: context.watermarkNumber },
    { userId: "user-other", watermarkNumber: 2 },
  ],
});
console.log("Crop result:", cropResult);
