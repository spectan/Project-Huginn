import sharp from "sharp";
import { DIGIT_ROTATION_DEGREES, DIGIT_STROKE_RATIO } from "./config";

/** Zero-pad a watermark number to 4 digits ("0001"). */
export function formatWatermarkNumber(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(4, "0");
}

// Seven-segment digit geometry. The production image has no fonts, so the
// digits are drawn as vector polygons (plain SVG rects) — never <text>.
// Coordinates are in units of digit height; the digit box is
// DIGIT_ASPECT wide by 1 tall.
const DIGIT_ASPECT = 0.6;
const DIGIT_SPACING = 0.25;

type Segment = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const DIGIT_SEGMENTS: Record<string, readonly Segment[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "d", "e", "g"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["b", "c", "f", "g"],
  "5": ["a", "c", "d", "f", "g"],
  "6": ["a", "c", "d", "e", "f", "g"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

// [x, y, width, height] of each segment inside the digit box, in units of
// digit height. Horizontal segments are inset by half a stroke so the joints
// read as seven-segment digits rather than a solid blob.
function segmentRects(): Record<Segment, [number, number, number, number]> {
  const s = DIGIT_STROKE_RATIO;
  const w = DIGIT_ASPECT;
  return {
    a: [s / 2, 0, w - s, s],
    b: [w - s, s / 2, s, 0.5 - s / 2],
    c: [w - s, 0.5, s, 0.5 - s / 2],
    d: [s / 2, 1 - s, w - s, s],
    e: [0, 0.5, s, 0.5 - s / 2],
    f: [0, s / 2, s, 0.5 - s / 2],
    g: [s / 2, 0.5 - s / 2, w - s, s],
  };
}

function fmt(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, "");
}

export interface NumberTileOptions {
  tileWidth: number;
  tileHeight: number;
  digitHeight: number;
  /** Fill opacity of the red digit strokes, 0-1. */
  alpha: number;
  /** Rotation in degrees; defaults to DIGIT_ROTATION_DEGREES. */
  rotation?: number;
}

/**
 * Render a transparent PNG tile with the given text drawn as rotated red
 * seven-segment digits, centered in the tile. The tile is meant to be
 * composited with sharp's `tile: true` to watermark a full map image.
 */
export async function renderNumberTile(
  text: string,
  options: NumberTileOptions
): Promise<Buffer> {
  const { tileWidth, tileHeight, digitHeight, alpha } = options;
  const rotation = options.rotation ?? DIGIT_ROTATION_DEGREES;

  const rects = segmentRects();
  const chars = text.split("").filter((c) => DIGIT_SEGMENTS[c] !== undefined);
  const totalWidth =
    chars.length * DIGIT_ASPECT + Math.max(0, chars.length - 1) * DIGIT_SPACING;

  // All segments go into a single path so overlapping joints are filled once
  // (separate rects would composite over each other and double the alpha at
  // every corner).
  const subpaths: string[] = [];
  let cursor = -totalWidth / 2;
  for (const char of chars) {
    const segments = DIGIT_SEGMENTS[char];
    if (segments === undefined) continue;
    for (const segment of segments) {
      const rect = rects[segment];
      const x = cursor + rect[0];
      const y = rect[1] - 0.5;
      subpaths.push(
        `M${fmt(x)} ${fmt(y)}h${fmt(rect[2])}v${fmt(rect[3])}h${fmt(-rect[2])}Z`
      );
    }
    cursor += DIGIT_ASPECT + DIGIT_SPACING;
  }

  const path =
    subpaths.length === 0 ? "" : `<path d="${subpaths.join("")}"/>`;

  const cx = fmt(tileWidth / 2);
  const cy = fmt(tileHeight / 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight}">` +
    `<g transform="rotate(${fmt(rotation)} ${cx} ${cy})">` +
    `<g transform="translate(${cx} ${cy}) scale(${fmt(digitHeight)})" fill="rgb(255,0,0)" fill-opacity="${fmt(alpha)}">` +
    path +
    `</g></g></svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
