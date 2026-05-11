import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("seed map asset", () => {
  it("is a 2048x2048 PNG", () => {
    const assetPath = join(process.cwd(), "public", "maps", "wurm-map.png");
    const bytes = readFileSync(assetPath);

    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(2048);
    expect(bytes.readUInt32BE(20)).toBe(2048);
    expect(bytes.length).toBe(929586);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "f4f033492adeabcafd2bb9153ba71b4065afa1418f9b61390a4c5da10b82865f"
    );
  });

  it("includes the Celebration topographical layer as a 2048x2048 PNG", () => {
    const assetPath = join(process.cwd(), "public", "maps", "celebration-topo.png");
    const bytes = readFileSync(assetPath);

    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(2048);
    expect(bytes.readUInt32BE(20)).toBe(2048);
    expect(bytes.length).toBe(1310428);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "9d7ae2d054262552fb7dfa1b7fc8a69000b22463ea6455e4417abc0ff6526fab"
    );
  });
});
