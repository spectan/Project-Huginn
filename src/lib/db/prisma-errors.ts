/** P2002: unique constraint violation. P2025: record required for the operation was not found. */
export function hasPrismaErrorCode(error: unknown, code: "P2002" | "P2025"): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}
