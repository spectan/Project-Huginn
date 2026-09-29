/** Maps a service error message to its HTTP status; any message not listed is a 400. */
export function getErrorStatus(error: string, statuses: ReadonlyMap<string, number>): number {
  return statuses.get(error) ?? 400;
}

export const MAP_ERROR_STATUSES: ReadonlyMap<string, number> = new Map([
  ["Read access is required", 403],
  ["Map was not found", 404]
]);

export const ADMIN_USER_ERROR_STATUSES: ReadonlyMap<string, number> = new Map([
  ["Admin access is required", 403],
  ["User was not found", 404]
]);
