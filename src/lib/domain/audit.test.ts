import { describe, expect, it } from "vitest";
import { assertNoCoordinateMetadata } from "./audit";

describe("assertNoCoordinateMetadata", () => {
  it("allows non-location audit metadata", () => {
    expect(() =>
      assertNoCoordinateMetadata({
        markerType: "TOWER",
        changedFields: ["qlHundredths", "damageHundredths"]
      })
    ).not.toThrow();
  });

  it("rejects top-level coordinate keys", () => {
    expect(() => assertNoCoordinateMetadata({ x: 12 })).toThrow(
      "Audit metadata must not store marker coordinates"
    );
  });

  it("rejects nested coordinate keys", () => {
    expect(() =>
      assertNoCoordinateMetadata({
        before: {
          position: {
            x: 12,
            y: 20
          }
        }
      })
    ).toThrow("Audit metadata must not store marker coordinates");
  });
});
