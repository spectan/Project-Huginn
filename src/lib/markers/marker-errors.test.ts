import { describe, expect, it } from "vitest";
import { getMarkerErrorStatus } from "./marker-errors";

describe("getMarkerErrorStatus", () => {
  it("maps access, not-found and validation errors", () => {
    expect(getMarkerErrorStatus("Read access is required")).toBe(403);
    expect(getMarkerErrorStatus("Write access is required")).toBe(403);
    expect(getMarkerErrorStatus("Map was not found")).toBe(404);
    expect(getMarkerErrorStatus("Marker was not found")).toBe(404);
    expect(getMarkerErrorStatus("Title is required")).toBe(400);
  });
});
