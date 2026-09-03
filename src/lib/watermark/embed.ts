import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { dirname, join } from "path";
import sharp from "sharp";
import {
  LARGE_DIGIT_HEIGHT,
  LARGE_TILE_ALPHA,
  LARGE_TILE_HEIGHT,
  LARGE_TILE_WIDTH,
  OVERLAY_ALPHA,
  SMALL_DIGIT_HEIGHT,
  SMALL_TILE_HEIGHT,
  SMALL_TILE_WIDTH,
  buildCacheKey,
  getWatermarkCacheDir,
} from "./config";
import { formatWatermarkNumber, renderNumberTile } from "./digits";

function hashInput(input: string | Buffer): Promise<string> {
  const hash = createHash("sha256");
  if (Buffer.isBuffer(input)) {
    hash.update(input);
    return Promise.resolve(hash.digest("hex"));
  }
  return new Promise(async (resolve, reject) => {
    const { createReadStream } = await import("fs");
    const stream = createReadStream(input);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export interface EmbedContext {
  layerId: string;
  mapId: string;
  userId: string;
  watermarkNumber: number;
}

export interface EmbedOptions {
  cache?: boolean;
}

// sharp refuses composite inputs larger than the base image even in tile
// mode. Cropping the tile to the image size is equivalent: the repeat just
// never gets past the first tile along the cropped axis. Only relevant for
// images smaller than a tile (real map layers are far larger).
async function fitTileToImage(
  tile: Buffer,
  tileWidth: number,
  tileHeight: number,
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  const width = Math.min(tileWidth, imageWidth);
  const height = Math.min(tileHeight, imageHeight);
  if (width === tileWidth && height === tileHeight) {
    return tile;
  }
  return sharp(tile)
    .extract({ left: 0, top: 0, width, height })
    .png()
    .toBuffer();
}

/**
 * Embed a per-user digit watermark into a map layer PNG.
 *
 * The user's zero-padded watermark number is tiled across the image as
 * barely-visible red seven-segment digits at two scales: a small tile that
 * stays readable around native zoom, and a large tile whose extra-wide
 * strokes survive heavy downscaling. Invisible in normal use; readable after
 * a saturation boost (see enhance.ts).
 */
export async function embedWatermark(
  imageInput: string | Buffer,
  context: EmbedContext,
  options: EmbedOptions = {}
): Promise<Buffer> {
  const { cache = true } = options;
  const cacheDir = getWatermarkCacheDir();
  const imageHash = await hashInput(imageInput);
  const cacheKey = buildCacheKey(imageHash, context.userId, context.layerId);
  const cachePath = join(cacheDir, cacheKey + ".png");

  if (cache) {
    try {
      const cached = await readFile(cachePath);
      return cached;
    } catch {
      // cache miss, continue
    }
  }

  const text = formatWatermarkNumber(context.watermarkNumber);
  const [smallTile, largeTile, meta] = await Promise.all([
    renderNumberTile(text, {
      tileWidth: SMALL_TILE_WIDTH,
      tileHeight: SMALL_TILE_HEIGHT,
      digitHeight: SMALL_DIGIT_HEIGHT,
      alpha: OVERLAY_ALPHA / 255,
    }),
    renderNumberTile(text, {
      tileWidth: LARGE_TILE_WIDTH,
      tileHeight: LARGE_TILE_HEIGHT,
      digitHeight: LARGE_DIGIT_HEIGHT,
      alpha: LARGE_TILE_ALPHA / 255,
    }),
    sharp(imageInput).metadata(),
  ]);

  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  const [fittedSmall, fittedLarge] = await Promise.all([
    fitTileToImage(
      smallTile,
      SMALL_TILE_WIDTH,
      SMALL_TILE_HEIGHT,
      imageWidth,
      imageHeight
    ),
    fitTileToImage(
      largeTile,
      LARGE_TILE_WIDTH,
      LARGE_TILE_HEIGHT,
      imageWidth,
      imageHeight
    ),
  ]);

  // The RGBA tiles add an alpha channel to RGB sources; drop it so the
  // output preserves the source channel count (the base is opaque, so the
  // alpha channel is uniformly 255 and removing it loses nothing).
  const stripAlpha = meta.hasAlpha === false;
  let pipeline = sharp(imageInput).composite([
    { input: fittedSmall, tile: true, blend: "over" },
    { input: fittedLarge, tile: true, blend: "over" },
  ]);
  if (stripAlpha) {
    pipeline = pipeline.removeAlpha();
  }

  const png = await pipeline.png({ compressionLevel: 6 }).toBuffer();

  if (cache) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, png);
  }

  return png;
}
