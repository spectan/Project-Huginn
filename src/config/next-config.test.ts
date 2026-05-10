import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js config", () => {
  it("hides the development indicator button", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });
});
