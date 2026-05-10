import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns an ok health payload", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.status).toBe(200);
  });
});
