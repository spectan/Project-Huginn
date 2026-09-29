export const READ_ACCESS_REQUIRED = "Read access is required";
export const WRITE_ACCESS_REQUIRED = "Write access is required";
export const MAP_NOT_FOUND = "Map was not found";
export const MARKER_NOT_FOUND = "Marker was not found";

// Maps a marker service error to its HTTP status. Anything not listed is a
// validation error.
export function getMarkerErrorStatus(error: string): 400 | 403 | 404 {
  if (error === READ_ACCESS_REQUIRED || error === WRITE_ACCESS_REQUIRED) {
    return 403;
  }

  if (error === MAP_NOT_FOUND || error === MARKER_NOT_FOUND) {
    return 404;
  }

  return 400;
}
