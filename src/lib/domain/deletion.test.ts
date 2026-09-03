import { describe, expect, it } from "vitest";
import { getDeleteExpiresAt } from "./deletion";

describe("deleted marker lifecycle", () => {
  it("sets delete expiration 72 hours after deletion", () => {
    const deletedAt = new Date("2026-05-10T00:00:00.000Z");

    expect(getDeleteExpiresAt(deletedAt)).toEqual(
      new Date("2026-05-13T00:00:00.000Z")
    );
  });
});
