export type RgbColor = {
  b: number;
  g: number;
  r: number;
};

export type TileHighlightSelection =
  | "Cave Entrance"
  | "Clay"
  | "Moss"
  | "Peat"
  | "Tar"
  | "All Roads"
  | "Cobblestone"
  | "Paved Brick"
  | "Paved Slabs"
  | "Grass"
  | "Tree / Bush"
  | "Dirt"
  | "Sand"
  | "Rock"
  | "Cliff"
  | "Steppe"
  | "Tundra"
  | "Marsh"
  | "Lava"
  | "Mycelium"
  | "Infected Tree / Bush"
  | "Hay Drying Tile";

export type TileHighlightOptionGroup = {
  label: string;
  options: TileHighlightSelection[];
};

export const TILE_HIGHLIGHT_GROUPS: TileHighlightOptionGroup[] = [
  {
    label: "Resources",
    options: ["Cave Entrance", "Clay", "Moss", "Peat", "Tar"]
  },
  {
    label: "Roads",
    options: ["All Roads", "Cobblestone", "Paved Brick", "Paved Slabs"]
  },
  {
    label: "Natural Terrain",
    options: [
      "Grass",
      "Tree / Bush",
      "Dirt",
      "Sand",
      "Rock",
      "Cliff",
      "Steppe",
      "Tundra",
      "Marsh",
      "Lava"
    ]
  },
  {
    label: "Infected Terrain",
    options: ["Mycelium", "Infected Tree / Bush"]
  },
  {
    label: "Other",
    options: ["Hay Drying Tile"]
  }
];

const TILE_HIGHLIGHT_SELECTIONS = new Set<string>(
  TILE_HIGHLIGHT_GROUPS.flatMap((group) => group.options)
);

const TILE_TYPE_COLORS: Record<Exclude<TileHighlightSelection, "All Roads">, RgbColor> = {
  "Cave Entrance": { r: 0, g: 0, b: 0 },
  Clay: { r: 113, g: 124, b: 118 },
  Moss: { r: 106, g: 142, b: 56 },
  Peat: { r: 54, g: 39, b: 32 },
  Tar: { r: 18, g: 21, b: 40 },
  Cobblestone: { r: 79, g: 74, b: 64 },
  "Paved Brick": { r: 92, g: 83, b: 73 },
  "Paved Slabs": { r: 99, g: 99, b: 99 },
  Grass: { r: 54, g: 101, b: 3 },
  "Tree / Bush": { r: 41, g: 58, b: 2 },
  Dirt: { r: 75, g: 63, b: 47 },
  Sand: { r: 160, g: 147, b: 109 },
  Rock: { r: 114, g: 110, b: 107 },
  Cliff: { r: 155, g: 151, b: 148 },
  Steppe: { r: 114, g: 117, b: 67 },
  Tundra: { r: 118, g: 135, b: 109 },
  Marsh: { r: 43, g: 101, b: 72 },
  Lava: { r: 215, g: 51, b: 30 },
  Mycelium: { r: 71, g: 2, b: 51 },
  "Infected Tree / Bush": { r: 221, g: 2, b: 41 },
  "Hay Drying Tile": { r: 252, g: 227, b: 3 }
};

export function getTileHighlightTargetColors(selection: TileHighlightSelection): RgbColor[] {
  if (selection === "All Roads") {
    return [
      TILE_TYPE_COLORS.Cobblestone,
      TILE_TYPE_COLORS["Paved Brick"],
      TILE_TYPE_COLORS["Paved Slabs"]
    ];
  }

  return [TILE_TYPE_COLORS[selection]];
}

export function isTileHighlightSelection(value: string): value is TileHighlightSelection {
  return TILE_HIGHLIGHT_SELECTIONS.has(value);
}

export function buildTileHighlightOutlineMask(
  sourceData: Uint8ClampedArray,
  width: number,
  height: number,
  targetColors: readonly RgbColor[],
  highlightColor: RgbColor
): Uint8ClampedArray {
  const targets = new Set(targetColors.map(packRgb));
  const targetMask = new Uint8Array(width * height);
  const output = new Uint8ClampedArray(sourceData.length);

  for (let index = 0; index < sourceData.length; index += 4) {
    const r = sourceData[index] ?? 0;
    const g = sourceData[index + 1] ?? 0;
    const b = sourceData[index + 2] ?? 0;

    if (targets.has(packRgb({ r, g, b }))) {
      targetMask[index / 4] = 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileIndex = y * width + x;

      if (targetMask[tileIndex] !== 1) {
        continue;
      }

      paintNeighborOutlinePixels(output, targetMask, width, height, x, y, highlightColor);
    }
  }

  return output;
}

function paintNeighborOutlinePixels(
  output: Uint8ClampedArray,
  targetMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  highlightColor: RgbColor
): void {
  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      const neighborX = x + deltaX;
      const neighborY = y + deltaY;

      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        continue;
      }

      const neighborTileIndex = neighborY * width + neighborX;

      if (targetMask[neighborTileIndex] === 1) {
        continue;
      }

      const outputIndex = neighborTileIndex * 4;
      output[outputIndex] = highlightColor.r;
      output[outputIndex + 1] = highlightColor.g;
      output[outputIndex + 2] = highlightColor.b;
      output[outputIndex + 3] = 255;
    }
  }
}

export function parseHexRgb(value: string): RgbColor {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value.trim());

  if (match === null) {
    return { r: 255, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(match[1] ?? "ff", 16),
    g: Number.parseInt(match[2] ?? "00", 16),
    b: Number.parseInt(match[3] ?? "00", 16)
  };
}

export function packRgb(color: RgbColor): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}
