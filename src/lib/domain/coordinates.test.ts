import { describe, expect, it } from "vitest";
import { validateCoordinate } from "./coordinates";

const bounds = {
  widthPx: 1000,
  heightPx: 800
};

describe("validateCoordinate", () => {
  it("accepts integer coordinates inside top-left map bounds", () => {
    expect(validateCoordinate({ x: 0, y: 0 }, bounds)).toEqual({
      ok: true,
      value: { x: 0, y: 0 }
    });
    expect(validateCoordinate({ x: 999, y: 799 }, bounds)).toEqual({
      ok: true,
      value: { x: 999, y: 799 }
    });
  });

  it("rejects coordinates outside map bounds", () => {
    expect(validateCoordinate({ x: 1000, y: 799 }, bounds)).toEqual({
      ok: false,
      error: "Coordinate must be inside map bounds"
    });
    expect(validateCoordinate({ x: 999, y: 800 }, bounds)).toEqual({
      ok: false,
      error: "Coordinate must be inside map bounds"
    });
  });

  it("rejects non-integer coordinates", () => {
    expect(validateCoordinate({ x: 1.5, y: 2 }, bounds)).toEqual({
      ok: false,
      error: "Coordinate values must be integers"
    });
  });
});
