import { describe, expect, it } from "vitest";
import {
  formatTowerCreator,
  validateCampInput,
  validateDeedInput,
  validateMinedoorInput,
  validateNoteInput,
  validatePathInput,
  validateRiftInput,
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

  it.each(["0", "1", "42", "999"])("allows creator number %s", (makerNumber) => {
    expect(
      validateTowerInput(
        {
          x: 25,
          y: 30,
          ql: "89.50",
          damage: "0.25",
          makerName: "Mako",
          makerNumber
        },
        bounds
      )
    ).toMatchObject({
      ok: true,
      value: {
        makerNumber
      }
    });
  });

  it.each([
    ["94A", "Creator number must be blank or a whole number from 0 to 999"],
    ["1000", "Creator number must be blank or a whole number from 0 to 999"],
    ["-1", "Creator number must be blank or a whole number from 0 to 999"]
  ])("rejects creator number %s", (makerNumber, error) => {
    expect(
      validateTowerInput(
        {
          x: 25,
          y: 30,
          ql: "89.50",
          damage: "0.25",
          makerName: "Mako",
          makerNumber
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error
    });
  });
});

describe("formatTowerCreator", () => {
  it("shows unknown numbers for incomplete tower creator identities", () => {
    expect(formatTowerCreator({ makerName: "Mako", makerNumber: "" })).toBe("Mako - ???");
    expect(formatTowerCreator({ makerName: "Kichi", makerNumber: "1" })).toBe("Kichi 1");
    expect(formatTowerCreator({ makerName: "Kichi", makerNumber: "42" })).toBe("Kichi 42");
    expect(formatTowerCreator({ makerName: "Mako", makerNumber: "945" })).toBe("Mako 945");
  });
});

describe("validateDeedInput", () => {
  it("normalizes a valid deed input", () => {
    expect(
      validateDeedInput(
        {
          foundingDate: "2026-05-10",
          name: " Oak Harbour ",
          x: 100,
          y: 120,
          north: 5,
          perimeter: 5,
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
        foundingDate: new Date("2026-05-10T00:00:00.000Z"),
        name: "Oak Harbour",
        x: 100,
        y: 120,
        north: 5,
        perimeter: 5,
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
          foundingDate: "",
          name: "Oak Harbour",
          x: 3,
          y: 120,
          north: 5,
          perimeter: 5,
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
          foundingDate: "",
          name: "Oak Harbour",
          x: 100,
          y: 120,
          north: 5,
          perimeter: 5,
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
        foundingDate: null,
        north: 5,
        perimeter: 5,
        west: 5,
        east: 5,
        south: 5
      }
    });
  });

  it("rejects deed perimeters outside the allowed range", () => {
    expect(
      validateDeedInput(
        {
          foundingDate: "",
          name: "Oak Harbour",
          x: 100,
          y: 120,
          north: 5,
          perimeter: 101,
          west: 5,
          east: 5,
          south: 5,
          founder: "Founder"
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error: "Perimeter must be an integer from 0 to 100"
    });
  });

  it("rejects deeds when the expanded perimeter does not fit on the map", () => {
    expect(
      validateDeedInput(
        {
          foundingDate: "",
          name: "Oak Harbour",
          x: 8,
          y: 120,
          north: 5,
          perimeter: 5,
          west: 5,
          east: 5,
          south: 5,
          founder: "Founder"
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error: "Deed perimeter must fit inside map bounds"
    });
  });

  it("rejects invalid deed founding dates", () => {
    expect(
      validateDeedInput(
        {
          foundingDate: "2026-02-30",
          name: "Oak Harbour",
          x: 100,
          y: 120,
          north: 5,
          perimeter: 5,
          west: 5,
          east: 5,
          south: 5,
          founder: "Founder"
        },
        bounds
      )
    ).toEqual({
      ok: false,
      error: "Founding date must be a valid date in YYYY-MM-DD format"
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

describe("validateRiftInput", () => {
  it("normalizes optional rift dates and notes", () => {
    expect(validateRiftInput({
      arrivalDate: "",
      estimatedRiftTime: "",
      notes: "  ",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: true,
      value: {
        arrivalDate: null,
        estimatedRiftTime: null,
        notes: "",
        x: 100,
        y: 120
      }
    });
  });

  it("normalizes supplied rift dates", () => {
    expect(validateRiftInput({
      arrivalDate: "2026-05-10",
      estimatedRiftTime: "2026-05-10T18:30",
      notes: " Bring cotton ",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: true,
      value: {
        arrivalDate: new Date("2026-05-10T00:00:00.000Z"),
        estimatedRiftTime: new Date("2026-05-10T18:30:00.000Z"),
        notes: "Bring cotton",
        x: 100,
        y: 120
      }
    });
  });

  it("rejects rifts whose 3 by 3 marker footprint does not fit on the map", () => {
    expect(validateRiftInput({
      arrivalDate: "",
      estimatedRiftTime: "",
      notes: "",
      x: 0,
      y: 120
    }, bounds)).toEqual({
      ok: false,
      error: "Rift marker must fit inside map bounds"
    });
  });

  it("rejects invalid rift dates", () => {
    expect(validateRiftInput({
      arrivalDate: "2026-02-30",
      estimatedRiftTime: "",
      notes: "",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: false,
      error: "Date of arrival must be a valid date in YYYY-MM-DD format"
    });
  });
});

describe("validateCampInput", () => {
  it("normalizes a valid camp input", () => {
    expect(validateCampInput({
      campType: "Goblin",
      notes: " Bring friends ",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: true,
      value: {
        campType: "Goblin",
        notes: "Bring friends",
        x: 100,
        y: 120
      }
    });
  });

  it("rejects invalid camp types", () => {
    expect(validateCampInput({
      campType: "Dragon",
      notes: "",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: false,
      error: "Camp type must be Rift or Goblin"
    });
  });
});

describe("validateMinedoorInput", () => {
  it("normalizes optional minedoor strength and notes", () => {
    expect(validateMinedoorInput({
      notes: "  hidden entrance  ",
      strength: "  73ql  ",
      x: 100,
      y: 120
    }, bounds)).toEqual({
      ok: true,
      value: {
        notes: "hidden entrance",
        strength: "73ql",
        x: 100,
        y: 120
      }
    });
  });
});

describe("validatePathInput", () => {
  it("normalizes bridge, canal, and highway paths with at least two points", () => {
    expect(validatePathInput({
      name: "Cedar Bridge",
      notes: "Two lanes",
      points: [
        { x: 10, y: 20 },
        { x: 12, y: 20 },
        { x: 12, y: 24 }
      ],
      type: "bridge",
      width: 2
    }, bounds)).toEqual({
      ok: true,
      value: {
        name: "Cedar Bridge",
        notes: "Two lanes",
        pathType: "bridge",
        points: [
          { x: 10, y: 20 },
          { x: 12, y: 20 },
          { x: 12, y: 24 }
        ],
        width: 2,
        x: 10,
        y: 20
      }
    });
  });

  it.each([
    {
      error: "Path must have at least two points",
      input: {
        name: "",
        notes: "",
        points: [{ x: 10, y: 20 }],
        type: "highway",
        width: 1
      }
    },
    {
      error: "Path must have 10 points or fewer",
      input: {
        name: "",
        notes: "",
        points: Array.from({ length: 11 }, (_, index) => ({ x: index, y: index })),
        type: "canal",
        width: 1
      }
    },
    {
      error: "Path width must be an integer from 1 to 20",
      input: {
        name: "",
        notes: "",
        points: [{ x: 10, y: 20 }, { x: 11, y: 20 }],
        type: "bridge",
        width: 0
      }
    },
    {
      error: "Path type must be bridge, canal, or highway",
      input: {
        name: "",
        notes: "",
        points: [{ x: 10, y: 20 }, { x: 11, y: 20 }],
        type: "tunnel",
        width: 1
      }
    }
  ])("rejects invalid path input: $error", ({ error, input }) => {
    expect(validatePathInput(input, bounds)).toEqual({
      ok: false,
      error
    });
  });
});
