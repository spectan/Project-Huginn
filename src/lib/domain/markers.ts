import { MAX_NAME_LENGTH, MAX_NOTE_TEXT_LENGTH, MAX_PATH_POINTS, MAX_PATH_WIDTH_TILES } from "./constants";
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

export type CampType = "Rift" | "Goblin";

export type DeedInput = {
  east: number;
  foundingDate: string;
  founder: string;
  name: string;
  north: number;
  perimeter: number;
  south: number;
  west: number;
  x: number;
  y: number;
};

export type DeedMarkerInput = {
  east: number;
  foundingDate: Date | null;
  founder: string;
  name: string;
  north: number;
  perimeter: number;
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

export type RiftInput = {
  arrivalDate: string;
  estimatedRiftTime: string;
  notes: string;
  x: number;
  y: number;
};

export type RiftMarkerInput = {
  arrivalDate: Date | null;
  estimatedRiftTime: Date | null;
  notes: string;
  x: number;
  y: number;
};

export type CampInput = {
  campType: string;
  notes: string;
  x: number;
  y: number;
};

export type CampMarkerInput = {
  campType: CampType;
  notes: string;
  x: number;
  y: number;
};

export type MinedoorInput = {
  notes: string;
  strength: string;
  x: number;
  y: number;
};

export type MinedoorMarkerInput = {
  notes: string;
  strength: string;
  x: number;
  y: number;
};

export type PathType = "bridge" | "canal" | "highway";

export type PathPointInput = {
  x: number;
  y: number;
};

export type PathInput = {
  name: string;
  notes: string;
  points: PathPointInput[];
  type: string;
  width: number;
};

export type PathMarkerInput = {
  name: string;
  notes: string;
  pathType: PathType;
  points: PathPointInput[];
  width: number;
  x: number;
  y: number;
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

  const foundingDate = normalizeOptionalDate(input.foundingDate, "Founding date");
  if (!foundingDate.ok) {
    return foundingDate;
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

  const perimeter = validatePerimeter(input.perimeter);
  if (!perimeter.ok) {
    return perimeter;
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

  if (
    coordinate.value.x - west.value - perimeter.value < 0 ||
    coordinate.value.y - north.value - perimeter.value < 0 ||
    coordinate.value.x + east.value + perimeter.value >= bounds.widthPx ||
    coordinate.value.y + south.value + perimeter.value >= bounds.heightPx
  ) {
    return err("Deed perimeter must fit inside map bounds");
  }

  return ok({
    east: east.value,
    foundingDate: foundingDate.value,
    founder: founder.value,
    name: name.value,
    north: north.value,
    perimeter: perimeter.value,
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

export function validateRiftInput(
  input: RiftInput,
  bounds: MapBounds
): Result<RiftMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const markerBounds = validateCenteredMarkerFootprint(coordinate.value, bounds, "Rift");
  if (!markerBounds.ok) {
    return markerBounds;
  }

  const arrivalDate = normalizeOptionalDate(input.arrivalDate, "Date of arrival");
  if (!arrivalDate.ok) {
    return arrivalDate;
  }

  const estimatedRiftTime = normalizeOptionalDateTime(input.estimatedRiftTime, "Estimated rift time");
  if (!estimatedRiftTime.ok) {
    return estimatedRiftTime;
  }

  const notes = normalizeOptionalText(input.notes, "Notes", MAX_NOTE_TEXT_LENGTH);
  if (!notes.ok) {
    return notes;
  }

  return ok({
    arrivalDate: arrivalDate.value,
    estimatedRiftTime: estimatedRiftTime.value,
    notes: notes.value,
    x: coordinate.value.x,
    y: coordinate.value.y
  });
}

export function validateCampInput(
  input: CampInput,
  bounds: MapBounds
): Result<CampMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const markerBounds = validateCenteredMarkerFootprint(coordinate.value, bounds, "Camp");
  if (!markerBounds.ok) {
    return markerBounds;
  }

  const campType = normalizeCampType(input.campType);
  if (!campType.ok) {
    return campType;
  }

  const notes = normalizeOptionalText(input.notes, "Notes", MAX_NOTE_TEXT_LENGTH);
  if (!notes.ok) {
    return notes;
  }

  return ok({
    campType: campType.value,
    notes: notes.value,
    x: coordinate.value.x,
    y: coordinate.value.y
  });
}

export function validateMinedoorInput(
  input: MinedoorInput,
  bounds: MapBounds
): Result<MinedoorMarkerInput> {
  const coordinate = validateCoordinate({ x: input.x, y: input.y }, bounds);
  if (!coordinate.ok) {
    return coordinate;
  }

  const strength = normalizeOptionalText(input.strength, "Strength", MAX_NAME_LENGTH);
  if (!strength.ok) {
    return strength;
  }

  const notes = normalizeOptionalText(input.notes, "Notes", MAX_NOTE_TEXT_LENGTH);
  if (!notes.ok) {
    return notes;
  }

  return ok({
    notes: notes.value,
    strength: strength.value,
    x: coordinate.value.x,
    y: coordinate.value.y
  });
}

export function validatePathInput(
  input: PathInput,
  bounds: MapBounds
): Result<PathMarkerInput> {
  const pathType = normalizePathType(input.type);
  if (!pathType.ok) {
    return pathType;
  }

  if (!Array.isArray(input.points) || input.points.length < 2) {
    return err("Path must have at least two points");
  }

  if (input.points.length > MAX_PATH_POINTS) {
    return err(`Path must have ${MAX_PATH_POINTS} points or fewer`);
  }

  if (!Number.isInteger(input.width) || input.width < 1 || input.width > MAX_PATH_WIDTH_TILES) {
    return err(`Path width must be an integer from 1 to ${MAX_PATH_WIDTH_TILES}`);
  }

  const points: PathPointInput[] = [];

  for (const point of input.points) {
    const coordinate = validateCoordinate(point, bounds);
    if (!coordinate.ok) {
      return coordinate;
    }

    points.push(coordinate.value);
  }

  const name = normalizeOptionalText(input.name, "Name", MAX_NAME_LENGTH);
  if (!name.ok) {
    return name;
  }

  const notes = normalizeOptionalText(input.notes, "Notes", MAX_NOTE_TEXT_LENGTH);
  if (!notes.ok) {
    return notes;
  }

  const firstPoint = points[0] ?? { x: 0, y: 0 };

  return ok({
    name: name.value,
    notes: notes.value,
    pathType: pathType.value,
    points,
    width: input.width,
    x: firstPoint.x,
    y: firstPoint.y
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

function normalizeOptionalText(input: string, label: string, maxLength: number): Result<string> {
  const value = input.trim();

  if (value.length > maxLength) {
    return err(`${label} must be ${maxLength} characters or less`);
  }

  return ok(value);
}

function validateDirectionalDimension(input: number, label: string): Result<number> {
  if (!Number.isInteger(input) || input < 0) {
    return err(`${label} dimension must be a non-negative integer`);
  }

  return ok(input);
}

function validatePerimeter(input: number): Result<number> {
  if (!Number.isInteger(input) || input < 0 || input > 100) {
    return err("Perimeter must be an integer from 0 to 100");
  }

  return ok(input);
}

function normalizeOptionalDate(input: string, label: string): Result<Date | null> {
  const value = input.trim();

  if (value.length === 0) {
    return ok(null);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return err(`${label} must be a valid date in YYYY-MM-DD format`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return err(`${label} must be a valid date in YYYY-MM-DD format`);
  }

  return ok(date);
}

function normalizeOptionalDateTime(input: string, label: string): Result<Date | null> {
  const value = input.trim();

  if (value.length === 0) {
    return ok(null);
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return err(`${label} must be a valid date and time in YYYY-MM-DDTHH:mm format`);
  }

  const date = new Date(`${value}:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== value) {
    return err(`${label} must be a valid date and time in YYYY-MM-DDTHH:mm format`);
  }

  return ok(date);
}

function normalizeCampType(input: string): Result<CampType> {
  if (input === "Rift" || input === "Goblin") {
    return ok(input);
  }

  return err("Camp type must be Rift or Goblin");
}

function normalizePathType(input: string): Result<PathType> {
  if (input === "bridge" || input === "canal" || input === "highway") {
    return ok(input);
  }

  return err("Path type must be bridge, canal, or highway");
}

function validateCenteredMarkerFootprint(
  coordinate: { x: number; y: number },
  bounds: MapBounds,
  label: string
): Result<true> {
  if (
    coordinate.x - 1 < 0 ||
    coordinate.y - 1 < 0 ||
    coordinate.x + 1 >= bounds.widthPx ||
    coordinate.y + 1 >= bounds.heightPx
  ) {
    return err(`${label} marker must fit inside map bounds`);
  }

  return ok(true);
}
