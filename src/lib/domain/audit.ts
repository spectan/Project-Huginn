const COORDINATE_METADATA_KEYS = new Set([
  "coordinate",
  "coordinates",
  "position",
  "x",
  "y"
]);

export function assertNoCoordinateMetadata(
  metadata: Record<string, unknown>
): void {
  if (containsCoordinateMetadata(metadata)) {
    throw new Error("Audit metadata must not store marker coordinates");
  }
}

function containsCoordinateMetadata(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsCoordinateMetadata(item));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, childValue]) => {
    return (
      COORDINATE_METADATA_KEYS.has(key.toLowerCase()) ||
      containsCoordinateMetadata(childValue)
    );
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
