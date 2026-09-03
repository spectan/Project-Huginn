import { err, ok, type Result } from "./result";

export type MapBounds = {
  widthPx: number;
  heightPx: number;
};

export type Coordinate = {
  x: number;
  y: number;
};

export function validateCoordinate(
  coordinate: Coordinate,
  bounds: MapBounds
): Result<Coordinate> {
  if (!isSafeInteger(coordinate.x) || !isSafeInteger(coordinate.y)) {
    return err("Coordinate values must be integers");
  }

  if (!hasValidBounds(bounds)) {
    return err("Map bounds must be positive integers");
  }

  if (
    coordinate.x < 0 ||
    coordinate.y < 0 ||
    coordinate.x >= bounds.widthPx ||
    coordinate.y >= bounds.heightPx
  ) {
    return err("Coordinate must be inside map bounds");
  }

  return ok({ x: coordinate.x, y: coordinate.y });
}

function hasValidBounds(bounds: MapBounds): boolean {
  return (
    isSafeInteger(bounds.widthPx) &&
    isSafeInteger(bounds.heightPx) &&
    bounds.widthPx > 0 &&
    bounds.heightPx > 0
  );
}

function isSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}
