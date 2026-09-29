import { createReadStream } from "fs";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "fs/promises";
import { createHash, randomUUID } from "crypto";
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

function hashBuffer(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Content hashes of source files, keyed by path + mtime + size so an
// unchanged source is hashed once per process instead of on every request.
const sourceHashCache = new Map<string, { identity: string; hash: Promise<string> }>();

async function hashSourceFile(path: string): Promise<string> {
  const stats = await stat(path);
  const identity = `${stats.mtimeMs}:${stats.size}`;
  const cached = sourceHashCache.get(path);

  if (cached !== undefined && cached.identity === identity) {
    return cached.hash;
  }

  const hash = hashFile(path);
  sourceHashCache.set(path, { identity, hash });
  hash.catch(() => {
    if (sourceHashCache.get(path)?.hash === hash) {
      sourceHashCache.delete(path);
    }
  });

  return hash;
}

function hashInput(input: string | Buffer): Promise<string> {
  return Buffer.isBuffer(input) ? Promise.resolve(hashBuffer(input)) : hashSourceFile(input);
}

/** Cached watermarked images untouched for this long are deleted. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
/** Cache hits refresh the file mtime at most this often (keeps it "recent"). */
const CACHE_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastPruneAt = 0;

/**
 * Delete cached files (including abandoned temp files) not accessed or
 * modified within maxAgeMs. Returns the number of files removed.
 */
export async function pruneWatermarkCache(
  cacheDir: string,
  maxAgeMs: number = CACHE_MAX_AGE_MS,
  now: number = Date.now()
): Promise<number> {
  let entries: string[];

  try {
    entries = await readdir(cacheDir);
  } catch {
    return 0;
  }

  let removed = 0;

  for (const entry of entries) {
    const filePath = join(cacheDir, entry);

    try {
      const stats = await stat(filePath);

      if (!stats.isFile() || now - Math.max(stats.atimeMs, stats.mtimeMs) <= maxAgeMs) {
        continue;
      }

      await rm(filePath, { force: true });
      removed += 1;
    } catch {
      // Raced with another prune or write; skip.
    }
  }

  return removed;
}

function maybePruneCache(cacheDir: string): void {
  const now = Date.now();

  if (now - lastPruneAt < CACHE_PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneAt = now;
  void pruneWatermarkCache(cacheDir, CACHE_MAX_AGE_MS, now).catch(() => {});
}

async function touchIfStale(path: string): Promise<void> {
  const stats = await stat(path);
  const now = Date.now();

  if (now - stats.mtimeMs > CACHE_TOUCH_INTERVAL_MS) {
    const date = new Date(now);
    await utimes(path, date, date);
  }
}

async function writeCacheFile(cachePath: string, png: Buffer): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  // Write to a temp file in the same directory, then rename: readers never
  // observe a partially written cache entry.
  const tempPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempPath, png);
    await rename(tempPath, cachePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export interface EmbedContext {
  layerId: string;
  userId: string;
  watermarkNumber: number;
}

interface EmbedOptions {
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
    maybePruneCache(cacheDir);

    try {
      const cached = await readFile(cachePath);
      void touchIfStale(cachePath).catch(() => {});
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
    await writeCacheFile(cachePath, png);
  }

  return png;
}
