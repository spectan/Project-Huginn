import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { formatWatermarkNumber, renderNumberTile } from "./digits";

describe("formatWatermarkNumber", () => {
  it("zero-pads to 4 digits", () => {
    expect(formatWatermarkNumber(0)).toBe("0000");
    expect(formatWatermarkNumber(1)).toBe("0001");
    expect(formatWatermarkNumber(42)).toBe("0042");
    expect(formatWatermarkNumber(999)).toBe("0999");
    expect(formatWatermarkNumber(1234)).toBe("1234");
  });
});

describe("renderNumberTile", () => {
  it("returns a PNG of the requested dimensions", async () => {
    const tile = await renderNumberTile("0042", {
      tileWidth: 240,
      tileHeight: 120,
      digitHeight: 40,
      alpha: 8 / 255,
    });

    const meta = await sharp(tile).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(240);
    expect(meta.height).toBe(120);
  });

  it("has non-uniform alpha content (digits on a transparent background)", async () => {
    const tile = await renderNumberTile("0042", {
      tileWidth: 240,
      tileHeight: 120,
      digitHeight: 40,
      alpha: 8 / 255,
    });

    const { data, info } = await sharp(tile)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let min = 255;
    let max = 0;
    let opaqueRed = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const idx = i * info.channels;
      const a = data[idx + 3]!;
      if (a < min) min = a;
      if (a > max) max = a;
      if (a > 0 && data[idx]! > data[idx + 1]!) opaqueRed++;
    }

    expect(min).toBe(0);
    expect(max).toBeGreaterThan(0);
    expect(opaqueRed).toBeGreaterThan(0);
  });

  it("renders nothing for text without digits", async () => {
    const tile = await renderNumberTile("--", {
      tileWidth: 240,
      tileHeight: 120,
      digitHeight: 40,
      alpha: 8 / 255,
    });

    const { data, info } = await sharp(tile)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < info.width * info.height; i++) {
      expect(data[i * info.channels + 3]).toBe(0);
    }
  });
});
