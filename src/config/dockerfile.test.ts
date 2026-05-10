import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile", "utf8");

describe("Dockerfile", () => {
  it("copies public assets into the standalone runtime image", () => {
    expect(dockerfile).toContain("COPY --from=builder /app/public ./public");
  });
});
