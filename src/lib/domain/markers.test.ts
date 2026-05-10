import { describe, expect, it } from "vitest";
import {
  formatTowerCreator,
  validateDeedInput,
  validateNoteInput,
  validateTowerInput
} from "./markers";

const bounds = {
  widthPx: 1000,
  heightPx: 800
};

describe("validateTowerInput", () => {
  it("normalizes a valid tower input", () => {
    expect(
      validateTowerInput(
        {
          x: 25,
          y: 30,
          ql: "89.50",
          damage: "0.25",
          makerName: " Mako ",
          makerNumber: "945"
        },
        bounds
      )
    ).toEqual({
      ok: true,
      value: {
        x: 25,
        y: 30,
        qlHundredths: 8950,
        damageHundredths: 25,
        makerName: "Mako",
        makerNumber: "945"
      }
    });
  });

  it("allows a tower creator without a known number", () => {
    expect(
      validateTowerInput(
        {
          x: 25,
          y: 30,
          ql: "89.50",
          damage: "0.25",
          makerName: "Mako",
          makerNumber: ""
        },
        bounds
      )
    ).toEqual({
      ok: true,
      value: {
        x: 25,
        y: 30,
        qlHundredths: 8950,
        damageHundredths: 25,
        makerName: "Mako",
        makerNumber: ""
      }
    });
  });

  it("rejects creator numbers that are not blank or exactly three digits", () => {
    expect(
      validateTowerInput(
        {
          x: 25,
          y: 30,
          ql: "89.50",
          damage: "0.25",
          makerName: "Mako",
          makerNumber: "94A"
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error: "Creator number must be blank or exactly three digits"
    });
  });
});

describe("formatTowerCreator", () => {
  it("shows unknown numbers for incomplete tower creator identities", () => {
    expect(formatTowerCreator({ makerName: "Mako", makerNumber: "" })).toBe("Mako - ???");
    expect(formatTowerCreator({ makerName: "Mako", makerNumber: "945" })).toBe("Mako 945");
  });
});

describe("validateDeedInput", () => {
  it("normalizes a valid deed input", () => {
    expect(
      validateDeedInput(
        {
          name: " Oak Harbour ",
          x: 100,
          y: 120,
          north: 5,
          west: 6,
          east: 7,
          south: 8,
          founder: " Founder "
        },
        bounds
      )
    ).toEqual({
      ok: true,
      value: {
        name: "Oak Harbour",
        x: 100,
        y: 120,
        north: 5,
        west: 6,
        east: 7,
        south: 8,
        founder: "Founder"
      }
    });
  });

  it("rejects deeds that do not fit on the map", () => {
    expect(
      validateDeedInput(
        {
          name: "Oak Harbour",
          x: 3,
          y: 120,
          north: 5,
          west: 6,
          east: 7,
          south: 8,
          founder: "Founder"
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error: "Deed dimensions must fit inside map bounds"
    });
  });

  it("defaults to an 11 by 11 deed when all dimensions are 5", () => {
    expect(
      validateDeedInput(
        {
          name: "Oak Harbour",
          x: 100,
          y: 120,
          north: 5,
          west: 5,
          east: 5,
          south: 5,
          founder: "Founder"
        },
        bounds
      )
    ).toMatchObject({
      ok: true,
      value: {
        north: 5,
        west: 5,
        east: 5,
        south: 5
      }
    });
  });
});

describe("validateNoteInput", () => {
  it("normalizes a valid note input", () => {
    expect(
      validateNoteInput({
        category: " Landmarks ",
        text: " Scout here ",
        title: "  Mine entrance ",
        x: 5,
        y: 6
      }, bounds)
    ).toEqual({
      ok: true,
      value: {
        category: "Landmarks",
        text: "Scout here",
        title: "Mine entrance",
        x: 5,
        y: 6
      }
    });
  });

  it("rejects empty notes", () => {
    expect(validateNoteInput({
      category: "Landmarks",
      text: "   ",
      title: "Mine entrance",
      x: 5,
      y: 6
    }, bounds)).toEqual({
      ok: false,
      error: "Note text is required"
    });
  });

  it("rejects notes without a title or category", () => {
    expect(validateNoteInput({
      category: "",
      text: "Scout here",
      title: "",
      x: 5,
      y: 6
    }, bounds)).toEqual({
      ok: false,
      error: "Title is required"
    });
  });
});
