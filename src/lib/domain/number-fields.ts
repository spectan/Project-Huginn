import { err, ok, type Result } from "./result";

const DECIMAL_HUNDREDTHS_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export type ParseResult<T> = Result<T>;

export function parseQualityLevelHundredths(input: string): ParseResult<number> {
  return parseBoundedHundredths(input, 10000, "QL must be between 0.00 and 100.00");
}

export function parseDamageHundredths(input: string): ParseResult<number> {
  return parseBoundedHundredths(
    input,
    9999,
    "Damage must be between 0.00 and 99.99"
  );
}

export function formatHundredths(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Hundredths value must be a non-negative safe integer");
  }

  const whole = Math.floor(value / 100);
  const fractional = value % 100;

  return `${whole}.${fractional.toString().padStart(2, "0")}`;
}

function parseBoundedHundredths(
  input: string,
  maxHundredths: number,
  rangeError: string
): ParseResult<number> {
  const trimmed = input.trim();

  if (!DECIMAL_HUNDREDTHS_PATTERN.test(trimmed)) {
    return err(rangeError);
  }

  const [wholePart = "", decimalPart = ""] = trimmed.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const hundredths = Number.parseInt(decimalPart.padEnd(2, "0"), 10) || 0;
  const value = whole * 100 + hundredths;

  if (!Number.isSafeInteger(value) || value < 0 || value > maxHundredths) {
    return err(rangeError);
  }

  return ok(value);
}
