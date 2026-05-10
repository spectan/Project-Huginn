import { describe, expect, it } from "vitest";
import {
  canRestoreDeletedMarker,
  getDeleteExpiresAt,
  isDeletedMarkerCleanupEligible
} from "./deletion";

describe("deleted marker lifecycle", () => {
  it("sets delete expiration 72 hours after deletion", () => {
    const deletedAt = new Date("2026-05-10T00:00:00.000Z");

    expect(getDeleteExpiresAt(deletedAt)).toEqual(
      new Date("2026-05-13T00:00:00.000Z")
    );
  });

  it("allows restore before expiration", () => {
    const expiresAt = new Date("2026-05-13T00:00:00.000Z");
    const now = new Date("2026-05-12T23:59:59.999Z");

    expect(canRestoreDeletedMarker(now, expiresAt)).toBe(true);
    expect(isDeletedMarkerCleanupEligible(now, expiresAt)).toBe(false);
  });

  it("makes markers cleanup-eligible at expiration", () => {
    const expiresAt = new Date("2026-05-13T00:00:00.000Z");
    const now = new Date("2026-05-13T00:00:00.000Z");

    expect(canRestoreDeletedMarker(now, expiresAt)).toBe(false);
    expect(isDeletedMarkerCleanupEligible(now, expiresAt)).toBe(true);
  });
});
