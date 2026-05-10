import { describe, expect, it } from "vitest";
import {
  TILE_HIGHLIGHT_GROUPS,
  buildTileHighlightOutlineMask,
  getTileHighlightTargetColors,
  parseHexRgb
} from "./tile-highlighting";

describe("tile highlighting", () => {
  it("offers the same grouped tile selections as WurmMaps", () => {
    expect(TILE_HIGHLIGHT_GROUPS).toEqual([
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
    ]);
  });

  it("maps single tile selections to exact RGB colors", () => {
    expect(getTileHighlightTargetColors("Clay")).toEqual([{ r: 113, g: 124, b: 118 }]);
    expect(getTileHighlightTargetColors("Tar")).toEqual([{ r: 18, g: 21, b: 40 }]);
  });

  it("maps all roads to all paved road colors", () => {
    expect(getTileHighlightTargetColors("All Roads")).toEqual([
      { r: 79, g: 74, b: 64 },
      { r: 92, g: 83, b: 73 },
      { r: 99, g: 99, b: 99 }
    ]);
  });

  it("builds an outline mask around matching tiles without covering the matched tile", () => {
    const source = new Uint8ClampedArray([
      18, 21, 40, 255,
      18, 21, 40, 255,
      18, 21, 40, 255,
      18, 21, 40, 255,
      113, 124, 118, 255,
      18, 21, 40, 255,
      18, 21, 40, 255,
      18, 21, 40, 255,
      18, 21, 40, 255
    ]);
    const purple = { r: 192, g: 0, b: 255 };

    expect(buildTileHighlightOutlineMask(source, 3, 3, [{ r: 113, g: 124, b: 118 }], purple)).toEqual(
      new Uint8ClampedArray([
        192, 0, 255, 255,
        192, 0, 255, 255,
        192, 0, 255, 255,
        192, 0, 255, 255,
        0, 0, 0, 0,
        192, 0, 255, 255,
        192, 0, 255, 255,
        192, 0, 255, 255,
        192, 0, 255, 255
      ])
    );
  });

  it("parses CSS hex colors into RGB values", () => {
    expect(parseHexRgb("#22c55e")).toEqual({ r: 34, g: 197, b: 94 });
  });
});
