import { isTileHighlightSelection } from "@/lib/domain/tile-highlighting";
import {
  MAX_NOTE_CATEGORY_PIP_SIZE,
  MIN_NOTE_CATEGORY_PIP_SIZE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import type {
  AnnotationWorkspaceMarker,
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  TileHighlightSettings
} from "@/lib/markers/marker-types";

export type TileHighlightPanelPosition = {
  left: number;
  top: number;
};

export type EventFeedPanelSize = {
  height: number;
  width: number;
};

export type NoteCategoryColors = Record<string, string>;
export type NoteCategoryMarkerShapes = Record<string, NoteCategoryMarkerShape>;
export type NoteCategoryPipSizes = Record<string, number>;
export type UserAnnotation = AnnotationWorkspaceMarker;

export type UserMapSettings = {
  annotations: UserAnnotation[];
  eventFeedPanelSize: EventFeedPanelSize;
  favoriteServerId: string | null;
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markerVisibility: MarkerVisibility;
  noteCategoryColors: NoteCategoryColors;
  noteCategoryMarkerShapes: NoteCategoryMarkerShapes;
  noteCategoryPipSizes: NoteCategoryPipSizes;
  roadwayEditPanelPosition: TileHighlightPanelPosition | null;
  routePlannerSpeedKmh: number;
  searchLinesEnabled: boolean;
  tileHighlight: TileHighlightSettings;
  tileHighlightPanelPosition: TileHighlightPanelPosition | null;
};

export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = {
  annotations: true,
  bridges: true,
  camps: true,
  canals: true,
  deeds: true,
  deedNames: false,
  deedPerimeters: true,
  highways: true,
  locateSouls: true,
  minedoors: true,
  missionGrid: false,
  notes: true,
  overlays: true,
  plannedTowers: true,
  riftOverlays: true,
  sectorGrid: false,
  towers: true,
  towerNames: false,
  tunnels: true
};

export const DEFAULT_MARKER_COLORS: MarkerColors = {
  annotations: "#38bdf8",
  bridges: "#cc00cc",
  camps: "#facc15",
  canals: "#0055cc",
  deeds: "#facc15",
  highways: "#cccc00",
  locateSouls: "#f97316",
  minedoors: "#22d3ee",
  missionGrid: "#22c55e",
  notes: "#ff2bd6",
  rifts: "#ef4444",
  sectorGrid: "#ffffff",
  towers: "#ffffff",
  tunnels: "#6b7280"
};

export const DEFAULT_MARKER_OPACITIES: MarkerOpacities = {
  annotations: 50,
  bridges: 50,
  canals: 50,
  deeds: 100,
  highways: 50,
  locateSouls: 50,
  missionGrid: 50,
  notes: 50,
  riftOverlays: 100,
  sectorGrid: 50,
  towers: 100,
  tunnels: 50
};

export const DEFAULT_TILE_HIGHLIGHT: TileHighlightSettings = {
  color: "#c000ff",
  opacity: 50,
  selection: ""
};

export const MIN_EVENT_FEED_PANEL_SIZE: EventFeedPanelSize = {
  height: 160,
  width: 260
};

export const DEFAULT_EVENT_FEED_PANEL_SIZE: EventFeedPanelSize = {
  height: 240,
  width: 320
};

export const DEFAULT_USER_MAP_SETTINGS: UserMapSettings = {
  annotations: [],
  eventFeedPanelSize: DEFAULT_EVENT_FEED_PANEL_SIZE,
  favoriteServerId: null,
  markerColors: DEFAULT_MARKER_COLORS,
  markerOpacities: DEFAULT_MARKER_OPACITIES,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
  noteCategoryColors: {},
  noteCategoryMarkerShapes: {},
  noteCategoryPipSizes: {},
  roadwayEditPanelPosition: null,
  routePlannerSpeedKmh: 0,
  searchLinesEnabled: false,
  tileHighlight: DEFAULT_TILE_HIGHLIGHT,
  tileHighlightPanelPosition: null
};

const MARKER_VISIBILITY_KEYS = [
  "annotations",
  "bridges",
  "camps",
  "canals",
  "deeds",
  "deedNames",
  "deedPerimeters",
  "highways",
  "locateSouls",
  "minedoors",
  "missionGrid",
  "notes",
  "overlays",
  "plannedTowers",
  "riftOverlays",
  "sectorGrid",
  "towers",
  "towerNames",
  "tunnels"
] as const;

const MARKER_COLOR_KEYS = [
  "annotations",
  "bridges",
  "camps",
  "canals",
  "deeds",
  "highways",
  "locateSouls",
  "minedoors",
  "missionGrid",
  "notes",
  "rifts",
  "sectorGrid",
  "towers",
  "tunnels"
] as const;

const MARKER_OPACITY_KEYS = [
  "annotations",
  "bridges",
  "canals",
  "deeds",
  "highways",
  "locateSouls",
  "missionGrid",
  "notes",
  "riftOverlays",
  "sectorGrid",
  "towers",
  "tunnels"
] as const;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_STORED_PANEL_POSITION_PX = 10000;
const MAX_STORED_PANEL_SIZE_PX = 10000;
const MAX_ANNOTATION_TITLE_LENGTH = 120;
const MAX_ANNOTATION_TEXT_LENGTH = 2000;
const MAX_STORED_ANNOTATION_COORDINATE = 100000;

export function parseUserMapSettings(input: unknown): UserMapSettings {
  return parseUserMapSettingsWithFallback(input, DEFAULT_USER_MAP_SETTINGS);
}

export function mergeUserMapSettingsInput(
  current: UserMapSettings,
  input: unknown
): UserMapSettings {
  return parseUserMapSettingsWithFallback(input, current);
}

function parseUserMapSettingsWithFallback(
  input: unknown,
  fallback: UserMapSettings
): UserMapSettings {
  const source = isRecord(input) ? input : {};

  return {
    annotations: parseAnnotations(source.annotations, fallback.annotations),
    eventFeedPanelSize: parsePanelSize(source.eventFeedPanelSize, fallback.eventFeedPanelSize),
    favoriteServerId: parseFavoriteServerId(source.favoriteServerId, fallback.favoriteServerId),
    markerColors: parseMarkerColors(source.markerColors, fallback.markerColors),
    markerOpacities: parseMarkerOpacities(source.markerOpacities, fallback.markerOpacities),
    markerVisibility: parseMarkerVisibility(source.markerVisibility, fallback.markerVisibility),
    noteCategoryColors: parseNoteCategoryColors(source.noteCategoryColors, fallback.noteCategoryColors),
    noteCategoryMarkerShapes: parseNoteCategoryMarkerShapes(
      source.noteCategoryMarkerShapes,
      fallback.noteCategoryMarkerShapes
    ),
    noteCategoryPipSizes: parseNoteCategoryPipSizes(source.noteCategoryPipSizes, fallback.noteCategoryPipSizes),
    roadwayEditPanelPosition: parsePanelPosition(
      source.roadwayEditPanelPosition,
      fallback.roadwayEditPanelPosition
    ),
    routePlannerSpeedKmh: parseRoutePlannerSpeed(source.routePlannerSpeedKmh, fallback.routePlannerSpeedKmh),
    searchLinesEnabled: parseBoolean(source.searchLinesEnabled, fallback.searchLinesEnabled),
    tileHighlight: parseTileHighlight(source.tileHighlight, fallback.tileHighlight),
    tileHighlightPanelPosition: parsePanelPosition(
      source.tileHighlightPanelPosition,
      fallback.tileHighlightPanelPosition
    )
  };
}

export function getFavoriteServerIdFromSettingsRows(rows: Array<{ settings: unknown }>): string | null {
  for (const row of rows) {
    const source = isRecord(row.settings) ? row.settings : {};

    if (Object.hasOwn(source, "favoriteServerId")) {
      return parseUserMapSettings(row.settings).favoriteServerId;
    }
  }

  return null;
}

function parseAnnotations(input: unknown, fallback: UserAnnotation[]): UserAnnotation[] {
  if (input === undefined) {
    return fallback;
  }

  if (!Array.isArray(input)) {
    return fallback;
  }

  const annotations: UserAnnotation[] = [];
  const seenIds = new Set<string>();

  for (const entry of input) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const text = typeof entry.text === "string" ? entry.text.trim() : "";

    if (
      id.length === 0 ||
      seenIds.has(id) ||
      title.length === 0 ||
      !Number.isFinite(entry.x) ||
      !Number.isFinite(entry.y)
    ) {
      continue;
    }

    seenIds.add(id);
    annotations.push({
      id,
      text: text.slice(0, MAX_ANNOTATION_TEXT_LENGTH),
      title: title.slice(0, MAX_ANNOTATION_TITLE_LENGTH),
      type: "annotation",
      x: clamp(Math.round(Number(entry.x)), 0, MAX_STORED_ANNOTATION_COORDINATE),
      y: clamp(Math.round(Number(entry.y)), 0, MAX_STORED_ANNOTATION_COORDINATE)
    });
  }

  return annotations;
}

function parseFavoriteServerId(input: unknown, fallback: string | null): string | null {
  if (input === undefined) {
    return fallback;
  }

  if (input === null) {
    return null;
  }

  if (typeof input !== "string") {
    return fallback;
  }

  const favoriteServerId = input.trim();

  return favoriteServerId.length > 0 && favoriteServerId.length <= 120 ? favoriteServerId : fallback;
}

function parseMarkerVisibility(input: unknown, fallback: MarkerVisibility): MarkerVisibility {
  const source = isRecord(input) ? input : {};
  const visibility = { ...fallback };

  for (const key of MARKER_VISIBILITY_KEYS) {
    if (typeof source[key] === "boolean") {
      visibility[key] = source[key];
    }
  }

  return visibility;
}

function parseMarkerColors(input: unknown, fallback: MarkerColors): MarkerColors {
  const source = isRecord(input) ? input : {};
  const colors = { ...fallback };

  for (const key of MARKER_COLOR_KEYS) {
    colors[key] = parseHexColor(source[key], fallback[key]);
  }

  return colors;
}

function parseNoteCategoryColors(input: unknown, fallback: NoteCategoryColors): NoteCategoryColors {
  const source = isRecord(input) ? input : {};
  const colors = { ...fallback };

  for (const [categoryId, value] of Object.entries(source)) {
    if (categoryId.length === 0) {
      continue;
    }

    const parsedColor = parseHexColor(value, "");

    if (parsedColor.length > 0) {
      colors[categoryId] = parsedColor;
    }
  }

  return colors;
}

function parseNoteCategoryMarkerShapes(
  input: unknown,
  fallback: NoteCategoryMarkerShapes
): NoteCategoryMarkerShapes {
  const source = isRecord(input) ? input : {};
  const markerShapes = { ...fallback };

  for (const [categoryId, value] of Object.entries(source)) {
    if (categoryId.length === 0) {
      continue;
    }

    const markerShape = NOTE_CATEGORY_MARKER_SHAPES.find((shape) => shape === value);

    if (markerShape !== undefined) {
      markerShapes[categoryId] = markerShape;
    }
  }

  return markerShapes;
}

function parseNoteCategoryPipSizes(input: unknown, fallback: NoteCategoryPipSizes): NoteCategoryPipSizes {
  const source = isRecord(input) ? input : {};
  const pipSizes = { ...fallback };

  for (const [categoryId, value] of Object.entries(source)) {
    if (categoryId.length === 0 || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    pipSizes[categoryId] = clamp(
      Math.round(value),
      MIN_NOTE_CATEGORY_PIP_SIZE,
      MAX_NOTE_CATEGORY_PIP_SIZE
    );
  }

  return pipSizes;
}

function parseMarkerOpacities(input: unknown, fallback: MarkerOpacities): MarkerOpacities {
  const source = isRecord(input) ? input : {};
  const opacities = { ...fallback };

  for (const key of MARKER_OPACITY_KEYS) {
    opacities[key] = parseOpacity(source[key], fallback[key]);
  }

  return opacities;
}

function parseTileHighlight(input: unknown, fallback: TileHighlightSettings): TileHighlightSettings {
  const source = isRecord(input) ? input : {};
  const selection = source.selection;

  return {
    color: parseHexColor(source.color, fallback.color),
    opacity: parseOpacity(source.opacity, fallback.opacity),
    selection: typeof selection === "string" && (selection === "" || isTileHighlightSelection(selection))
      ? selection
      : fallback.selection
  };
}

function parsePanelSize(
  input: unknown,
  fallback: EventFeedPanelSize
): EventFeedPanelSize {
  if (input === undefined) {
    return fallback;
  }

  if (!isRecord(input) || !Number.isFinite(input.width) || !Number.isFinite(input.height)) {
    return fallback;
  }

  return {
    height: clamp(Math.round(Number(input.height)), MIN_EVENT_FEED_PANEL_SIZE.height, MAX_STORED_PANEL_SIZE_PX),
    width: clamp(Math.round(Number(input.width)), MIN_EVENT_FEED_PANEL_SIZE.width, MAX_STORED_PANEL_SIZE_PX)
  };
}

function parsePanelPosition(
  input: unknown,
  fallback: TileHighlightPanelPosition | null
): TileHighlightPanelPosition | null {
  if (input === undefined) {
    return fallback;
  }

  if (input === null) {
    return null;
  }

  if (!isRecord(input) || !Number.isFinite(input.left) || !Number.isFinite(input.top)) {
    return fallback;
  }

  return {
    left: clamp(Math.round(Number(input.left)), 0, MAX_STORED_PANEL_POSITION_PX),
    top: clamp(Math.round(Number(input.top)), 0, MAX_STORED_PANEL_POSITION_PX)
  };
}

function parseHexColor(input: unknown, fallback: string): string {
  if (typeof input !== "string" || !HEX_COLOR_PATTERN.test(input)) {
    return fallback;
  }

  return input.toLowerCase();
}

function parseOpacity(input: unknown, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fallback;
  }

  return clamp(Math.round(input), 0, 100);
}

function parseRoutePlannerSpeed(input: unknown, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fallback;
  }

  return clamp(Math.round(input), 0, 60);
}

function parseBoolean(input: unknown, fallback: boolean): boolean {
  return typeof input === "boolean" ? input : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
