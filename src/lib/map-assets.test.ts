import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const mapAssets = [
  { file: "celebration-terrain.png", height: 2048, width: 2048 },
  { file: "celebration-topo.png", height: 2048, width: 2048 },
  { file: "chaos-terrain.png", height: 4096, width: 4096 },
  { file: "chaos-topo.png", height: 4096, width: 4096 },
  { file: "deliverance-terrain.png", height: 2048, width: 2048 },
  { file: "deliverance-topo.png", height: 2048, width: 2048 },
  { file: "exodus-terrain.png", height: 2048, width: 2048 },
  { file: "exodus-topo.png", height: 2048, width: 2048 },
  { file: "independence-terrain.png", height: 4096, width: 4096 },
  { file: "independence-topo.png", height: 4096, width: 4096 },
  { file: "pristine-terrain.png", height: 2048, width: 2048 },
  { file: "pristine-topo.png", height: 2048, width: 2048 },
  { file: "release-terrain.png", height: 2048, width: 2048 },
  { file: "release-topo.png", height: 2048, width: 2048 },
  { file: "xanadu-terrain.png", height: 8192, width: 8192 },
  { file: "xanadu-topo.png", height: 8192, width: 8192 },
  { file: "cadence-terrain.png", height: 4096, width: 4096 },
  { file: "cadence-topo.png", height: 4096, width: 4096 },
  { file: "defiance-terrain.png", height: 4096, width: 4096 },
  { file: "defiance-topo.png", height: 4096, width: 4096 },
  { file: "harmony-terrain.png", height: 4096, width: 4096 },
  { file: "harmony-topo.png", height: 4096, width: 4096 },
  { file: "melody-terrain.png", height: 2048, width: 2048 },
  { file: "melody-topo.png", height: 2048, width: 2048 },
  { file: "affliction-terrain.png", height: 2048, width: 2048 },
  { file: "affliction-topo.png", height: 2048, width: 2048 },
  { file: "desertion-terrain.png", height: 2048, width: 2048 },
  { file: "desertion-topo.png", height: 2048, width: 2048 },
  { file: "elevation-terrain.png", height: 2048, width: 2048 },
  { file: "elevation-topo.png", height: 2048, width: 2048 },
  { file: "serenity-terrain.png", height: 2048, width: 2048 },
  { file: "serenity-topo.png", height: 2048, width: 2048 }
] as const;

describe("server map assets", () => {
  it.each(mapAssets)("includes $file as a $width x $height PNG", ({ file, height, width }) => {
    const bytes = readFileSync(join(process.cwd(), "public", "maps", file));

    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(width);
    expect(bytes.readUInt32BE(20)).toBe(height);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
