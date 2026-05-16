import { MAX_NAME_LENGTH } from "./constants";
import { err, ok, type Result } from "./result";

export const NOTE_CATEGORY_MARKER_SHAPES = ["circle", "x", "o", "triangle", "square"] as const;
export type NoteCategoryMarkerShape = typeof NOTE_CATEGORY_MARKER_SHAPES[number];

export const DEFAULT_NOTE_CATEGORY_MARKER_SHAPE: NoteCategoryMarkerShape = "circle";
export const DEFAULT_NOTE_CATEGORY_PIP_SIZE = 3;
export const MIN_NOTE_CATEGORY_PIP_SIZE = 1;
export const MAX_NOTE_CATEGORY_PIP_SIZE = 10;
export const DEFAULT_NOTE_CATEGORY_NAME = "General";

export type NoteCategoryInput = {
  name: string;
};

export function validateNoteCategoryInput(input: unknown): Result<NoteCategoryInput> {
  if (typeof input !== "object" || input === null) {
    return err("Category input is required");
  }

  const name = normalizeCategoryName((input as Record<string, unknown>).name);

  if (name === null) {
    return err("Category name is required");
  }

  return ok({
    name
  });
}

export function normalizeCategoryName(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  return trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH ? null : trimmed;
}
