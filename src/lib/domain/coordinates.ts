import { err, ok, type Result } from "./result";

export type MapBounds = {
  widthPx: number;
  heightPx: number;
};

export type Coordinate = {
  x: number;
  y: number;
};

export type Rectangle = Coordinate & {
  width: number;
  height: number;
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

export function validateRectangle(
  rectangle: Rectangle,
  bounds: MapBounds
): Result<Rectangle> {
  const coordinate = validateCoordinate(
    { x: rectangle.x, y: rectangle.y },
    bounds
  );

  if (!coordinate.ok) {
    return coordinate;
  }

  if (!isSafeInteger(rectangle.width) || !isSafeInteger(rectangle.height)) {
    return err("Rectangle width and height must be positive integers");
  }

  if (rectangle.width <= 0 || rectangle.height <= 0) {
    return err("Rectangle width and height must be positive integers");
  }

  if (
    rectangle.x + rectangle.width > bounds.widthPx ||
    rectangle.y + rectangle.height > bounds.heightPx
  ) {
    return err("Rectangle must fit inside map bounds");
  }

  return ok({
    x: rectangle.x,
    y: rectangle.y,
    width: rectangle.width,
    height: rectangle.height
  });
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
