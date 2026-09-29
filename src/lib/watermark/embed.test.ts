import { mkdtemp, readdir, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { OVERLAY_ALPHA } from "./config";
import { embedWatermark, pruneWatermarkCache, type EmbedContext } from "./embed";
import { isolateChromaImage } from "./enhance";
import { meanChromaDeviation } from "./test-helpers";

const SIZE = 512;

const context: EmbedContext = {
  layerId: "test-map:default",
  userId: "user-1",
  watermarkNumber: 42,
};

function midGrayImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

describe("embedWatermark", () => {
  it("is invisible: per-pixel channel delta stays within the overlay alpha", async () => {
    const original = await midGrayImage();
    const embedded = await embedWatermark(original, context, { cache: false });

    const before = await sharp(original).raw().toBuffer();
    const after = await sharp(embedded).raw().toBuffer();
    expect(after.length).toBe(before.length);

    let maxDelta = 0;
    for (let i = 0; i < before.length; i++) {
      const delta = Math.abs(after[i]! - before[i]!);
      if (delta > maxDelta) maxDelta = delta;
    }
    expect(maxDelta).toBeLessThanOrEqual(OVERLAY_ALPHA + 1);
  });

  it("carries a chroma signal that chroma isolation reveals", async () => {
    const original = await midGrayImage();
    const embedded = await embedWatermark(original, context, { cache: false });

    const signal = await meanChromaDeviation(await isolateChromaImage(embedded));
    const control = await meanChromaDeviation(await isolateChromaImage(original));

    // The flat-gray control has no chroma at all; the digits must contribute
    // a clearly measurable mean deviation.
    expect(control).toBeLessThan(1);
    expect(signal).toBeGreaterThan(5);
    expect(signal).toBeGreaterThan(control + 5);
  });
});

describe("embedWatermark file cache", () => {
  let cacheRoot: string;
  const originalStoragePath = process.env.MAP_STORAGE_PATH;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), "huginn-watermark-"));
    process.env.MAP_STORAGE_PATH = cacheRoot;
  });

  afterEach(async () => {
    if (originalStoragePath === undefined) {
      delete process.env.MAP_STORAGE_PATH;
    } else {
      process.env.MAP_STORAGE_PATH = originalStoragePath;
    }
    await rm(cacheRoot, { recursive: true, force: true });
  });

  it("writes the cache entry atomically and serves it on the next request", async () => {
    const sourcePath = join(cacheRoot, "source.png");
    await writeFile(sourcePath, await midGrayImage());

    const first = await embedWatermark(sourcePath, context, { cache: true });
    const cacheDir = join(cacheRoot, ".watermarks");
    const entries = await readdir(cacheDir);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^[0-9a-f]{64}\.png$/);

    const second = await embedWatermark(sourcePath, context, { cache: true });
    expect(second.equals(first)).toBe(true);
  });

  it("re-hashes the source when its size or mtime changes", async () => {
    const sourcePath = join(cacheRoot, "source.png");
    await writeFile(sourcePath, await midGrayImage());
    await embedWatermark(sourcePath, context, { cache: true });

    const smaller = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    await writeFile(sourcePath, smaller);
    const later = new Date(Date.now() + 60_000);
    await utimes(sourcePath, later, later);

    const embedded = await embedWatermark(sourcePath, context, { cache: true });
    const meta = await sharp(embedded).metadata();

    expect(meta.width).toBe(64);
    expect(await readdir(join(cacheRoot, ".watermarks"))).toHaveLength(2);
  });
});

describe("pruneWatermarkCache", () => {
  it("deletes only files untouched for longer than the max age", async () => {
    const dir = await mkdtemp(join(tmpdir(), "huginn-prune-"));

    try {
      const now = Date.now();
      const oldTime = new Date(now - 10 * 24 * 60 * 60 * 1000);
      await writeFile(join(dir, "old.png"), "old");
      await utimes(join(dir, "old.png"), oldTime, oldTime);
      await writeFile(join(dir, "fresh.png"), "fresh");

      const removed = await pruneWatermarkCache(dir, 7 * 24 * 60 * 60 * 1000, now);

      expect(removed).toBe(1);
      expect(await readdir(dir)).toEqual(["fresh.png"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 when the cache directory does not exist", async () => {
    await expect(pruneWatermarkCache(join(tmpdir(), "huginn-missing-dir-xyz"))).resolves.toBe(0);
  });
});
