import { MAX_NAME_LENGTH } from "./constants";
import { err, ok, type Result } from "./result";

export const NOTE_CATEGORY_MARKER_SHAPES = ["circle", "x", "o", "triangle", "square"] as const;
export type NoteCategoryMarkerShape = typeof NOTE_CATEGORY_MARKER_SHAPES[number];

export const DEFAULT_NOTE_CATEGORY_MARKER_SHAPE: NoteCategoryMarkerShape = "circle";
export const DEFAULT_NOTE_CATEGORY_PIP_SIZE = 3;
export const MIN_NOTE_CATEGORY_PIP_SIZE = 1;
export const MAX_NOTE_CATEGORY_PIP_SIZE = 10;
export const DEFAULT_NOTE_CATEGORY_NAME = "General";
// Category of the note a disbanded deed is converted into.
export const ABANDONED_DEED_CATEGORY_NAME = "Abandoned Deed";

type NoteCategoryInput = {
  name: string;
};

export function validateNoteCategoryInput(input: unknown): Result<NoteCategoryInput> {
  if (typeof input !== "object" || input === null) {
    return err("Category input is required");
  }

  const rawName = (input as Record<string, unknown>).name;
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (name.length === 0) {
    return err("Category name is required");
  }

  if (name.length > MAX_NAME_LENGTH) {
    return err(`Category name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  return ok({
    name
  });
}
