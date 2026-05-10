import { describe, expect, it } from "vitest";
import {
  formatHundredths,
  parseDamageHundredths,
  parseQualityLevelHundredths
} from "./number-fields";

describe("parseQualityLevelHundredths", () => {
  it("accepts QL values from 0.00 through 100.00", () => {
    expect(parseQualityLevelHundredths("0.00")).toEqual({ ok: true, value: 0 });
    expect(parseQualityLevelHundredths("99.99")).toEqual({
      ok: true,
      value: 9999
    });
    expect(parseQualityLevelHundredths("100.00")).toEqual({
      ok: true,
      value: 10000
    });
  });

  it("rejects QL values above 100.00", () => {
    expect(parseQualityLevelHundredths("100.01")).toEqual({
      ok: false,
      error: "QL must be between 0.00 and 100.00"
    });
  });
});

describe("parseDamageHundredths", () => {
  it("accepts damage values from 0.00 through 99.99", () => {
    expect(parseDamageHundredths("0.00")).toEqual({ ok: true, value: 0 });
    expect(parseDamageHundredths("99.99")).toEqual({
      ok: true,
      value: 9999
    });
  });

  it("rejects damage values at or above 100.00", () => {
    expect(parseDamageHundredths("100.00")).toEqual({
      ok: false,
      error: "Damage must be between 0.00 and 99.99"
    });
  });
});

describe("formatHundredths", () => {
  it("formats stored integer hundredths with two decimal places", () => {
    expect(formatHundredths(0)).toBe("0.00");
    expect(formatHundredths(5)).toBe("0.05");
    expect(formatHundredths(9999)).toBe("99.99");
  });
});
