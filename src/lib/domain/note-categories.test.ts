import { describe, expect, it } from "vitest";
import { validateNoteCategoryInput } from "./note-categories";

describe("validateNoteCategoryInput", () => {
  it("accepts and trims a valid name", () => {
    expect(validateNoteCategoryInput({ name: "  Resources  " })).toEqual({ ok: true, value: { name: "Resources" } });
  });

  it("requires a non-empty name", () => {
    expect(validateNoteCategoryInput({ name: "   " })).toEqual({ ok: false, error: "Category name is required" });
    expect(validateNoteCategoryInput({})).toEqual({ ok: false, error: "Category name is required" });
    expect(validateNoteCategoryInput(null)).toEqual({ ok: false, error: "Category input is required" });
  });

  it("explains when a name is too long", () => {
    expect(validateNoteCategoryInput({ name: "x".repeat(81) })).toEqual({
      ok: false,
      error: "Category name must be 80 characters or fewer"
    });
    expect(validateNoteCategoryInput({ name: "x".repeat(80) }).ok).toBe(true);
  });
});
