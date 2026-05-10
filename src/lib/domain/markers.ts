import { MAX_NAME_LENGTH, MAX_NOTE_TEXT_LENGTH } from "./constants";
import {
  type MapBounds,
  validateCoordinate
} from "./coordinates";
import {
  parseDamageHundredths,
  parseQualityLevelHundredths
} from "./number-fields";
import { err, ok, type Result } from "./result";

export type TowerInput = {
  x: number;
  y: number;
  ql: string;
  damage: string;
  makerName: string;
  makerNumber: string;
};

export type TowerMarkerInput = {
  x: number;
  y: number;
  qlHundredths: number;
  damageHundredths: number;
  makerName: string;
  makerNumber: string;
};

export type DeedInput = {
  east: number;
  founder: string;
  name: string;
  north: number;
  south: number;
  west: number;
  x: number;
  y: number;
};

export type DeedMarkerInput = {
  east: number;
  founder: string;
  name: string;
  north: number;
  south: number;
  west: number;
  x: number;
  y: number;
};

export type NoteInput = {
  category: string;
  title: string;
  x: number;
  y: number;
  text: string;
};

export type NoteMarkerInput = {
  category: string;
  title: string;
  x: number;
  y: number;
  text: string;
};

export function formatTowerCreator(input: { makerName: string; makerNumber: string }): string {
  const makerName = input.makerName.trim();
  const makerNumber = input.makerNumber.trim();

  if (makerNumber === "") {
    return `${makerName} - ???`;
  }

  return `${makerName} ${makerNumber}`;
}

export function validateTowerInput(
  input: TowerInput,
  bounds: MapBounds
): Result<TowerMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const ql = parseQualityLevelHundredths(input.ql);
  if (!ql.ok) {
    return ql;
  }

  const damage = parseDamageHundredths(input.damage);
  if (!damage.ok) {
    return damage;
  }

  const makerName = normalizeRequiredText(input.makerName, "Creator name");
  if (!makerName.ok) {
    return makerName;
  }

  const makerNumber = input.makerNumber.trim();
  if (makerNumber !== "" && !/^\d{3}$/.test(makerNumber)) {
    return err("Creator number must be blank or exactly three digits");
  }

  return ok({
    x: coordinate.value.x,
    y: coordinate.value.y,
    qlHundredths: ql.value,
    damageHundredths: damage.value,
    makerName: makerName.value,
    makerNumber
  });
}

export function validateDeedInput(
  input: DeedInput,
  bounds: MapBounds
): Result<DeedMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const name = normalizeRequiredText(input.name, "Name");
  if (!name.ok) {
    return name;
  }

  const north = validateDirectionalDimension(input.north, "North");
  if (!north.ok) {
    return north;
  }

  const west = validateDirectionalDimension(input.west, "West");
  if (!west.ok) {
    return west;
  }

  const east = validateDirectionalDimension(input.east, "East");
  if (!east.ok) {
    return east;
  }

  const south = validateDirectionalDimension(input.south, "South");
  if (!south.ok) {
    return south;
  }

  const founder = normalizeRequiredText(input.founder, "Mayor");
  if (!founder.ok) {
    return founder;
  }

  if (
    coordinate.value.x - west.value < 0 ||
    coordinate.value.y - north.value < 0 ||
    coordinate.value.x + east.value >= bounds.widthPx ||
    coordinate.value.y + south.value >= bounds.heightPx
  ) {
    return err("Deed dimensions must fit inside map bounds");
  }

  return ok({
    east: east.value,
    founder: founder.value,
    name: name.value,
    north: north.value,
    south: south.value,
    west: west.value,
    x: coordinate.value.x,
    y: coordinate.value.y
  });
}

export function validateNoteInput(
  input: NoteInput,
  bounds: MapBounds
): Result<NoteMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const title = normalizeRequiredText(input.title, "Title");
  if (!title.ok) {
    return title;
  }

  const category = normalizeRequiredText(input.category, "Category");
  if (!category.ok) {
    return category;
  }

  const text = input.text.trim();
  if (text.length === 0) {
    return err("Note text is required");
  }

  if (text.length > MAX_NOTE_TEXT_LENGTH) {
    return err(`Note text must be ${MAX_NOTE_TEXT_LENGTH} characters or less`);
  }

  return ok({
    category: category.value,
    title: title.value,
    x: coordinate.value.x,
    y: coordinate.value.y,
    text
  });
}

function normalizeRequiredText(input: string, label: string): Result<string> {
  const value = input.trim();

  if (value.length === 0) {
    return err(`${label} is required`);
  }

  if (value.length > MAX_NAME_LENGTH) {
    return err(`${label} must be ${MAX_NAME_LENGTH} characters or less`);
  }

  return ok(value);
}

function validateDirectionalDimension(input: number, label: string): Result<number> {
  if (!Number.isInteger(input) || input < 0) {
    return err(`${label} dimension must be a non-negative integer`);
  }

  return ok(input);
}
