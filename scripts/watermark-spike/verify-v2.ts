import { embedWatermark } from "../../src/lib/watermark/embed";
import { tryExtractWatermark } from "../../src/lib/watermark/extract";
import sharp from "sharp";
import { join } from "path";

async function main() {
  process.env.WATERMARK_SECRET = "test-secret";
  const samplePath = join(process.cwd(), "public", "maps", "celebration-terrain.png");
  const mapId = "map-celebration";
  const userId = "user-abc";
  const watermarkNumber = 1;
  const wrongNumber = 2;

  console.log("Embedding...");
  const watermarked = await embedWatermark(samplePath, { mapId, userId, watermarkNumber, layerId: "terrain" }, { cache: false });
  await sharp(watermarked).toFile("/tmp/wm_spread_v2.png");

  const candidates = [
    { userId, watermarkNumber },
    { userId: "user-wrong", watermarkNumber: wrongNumber },
  ];

  console.log("\nRaw PNG:");
  const raw = await tryExtractWatermark(watermarked, { mapId, candidates });
  console.log(raw);

  console.log("\nJPEG 80:");
  const jpeg80 = await sharp("/tmp/wm_spread_v2.png").jpeg({ quality: 80 }).toBuffer();
  const r80 = await tryExtractWatermark(jpeg80, { mapId, candidates });
  console.log(r80);

  console.log("\n50% center crop:");
  const meta = await sharp("/tmp/wm_spread_v2.png").metadata();
  const width = meta.width!;
  const height = meta.height!;
  const cropW = Math.floor(width * 0.5);
  const cropH = Math.floor(height * 0.5);
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);
  const cropped = await sharp("/tmp/wm_spread_v2.png").extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
  const rc = await tryExtractWatermark(cropped, { mapId, candidates });
  console.log(rc);

  console.log("\n50% center crop + JPEG 80:");
  const cropJpeg = await sharp(cropped).jpeg({ quality: 80 }).toBuffer();
  const rcj = await tryExtractWatermark(cropJpeg, { mapId, candidates });
  console.log(rcj);

  console.log("\n25% center crop:");
  const crop25W = Math.floor(width * 0.25);
  const crop25H = Math.floor(height * 0.25);
  const left25 = Math.floor((width - crop25W) / 2);
  const top25 = Math.floor((height - crop25H) / 2);
  const cropped25 = await sharp("/tmp/wm_spread_v2.png").extract({ left: left25, top: top25, width: crop25W, height: crop25H }).png().toBuffer();
  const rc25 = await tryExtractWatermark(cropped25, { mapId, candidates });
  console.log(rc25);
}

main().catch(console.error);
