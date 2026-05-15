import { isTileHighlightSelection } from "@/lib/domain/tile-highlighting";
import type {
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

export type UserMapSettings = {
  eventFeedPanelSize: EventFeedPanelSize;
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markerVisibility: MarkerVisibility;
  roadwayEditPanelPosition: TileHighlightPanelPosition | null;
  tileHighlight: TileHighlightSettings;
  tileHighlightPanelPosition: TileHighlightPanelPosition | null;
};

export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = {
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
  riftOverlays: true,
  sectorGrid: false,
  towers: true,
  towerNames: false
};

export const DEFAULT_MARKER_COLORS: MarkerColors = {
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
  towers: "#ffffff"
};

export const DEFAULT_MARKER_OPACITIES: MarkerOpacities = {
  bridges: 50,
  canals: 50,
  deeds: 50,
  highways: 50,
  locateSouls: 50,
  missionGrid: 50,
  notes: 50,
  riftOverlays: 50,
  sectorGrid: 50,
  towers: 50
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
  eventFeedPanelSize: DEFAULT_EVENT_FEED_PANEL_SIZE,
  markerColors: DEFAULT_MARKER_COLORS,
  markerOpacities: DEFAULT_MARKER_OPACITIES,
  markerVisibility: DEFAULT_MARKER_VISIBILITY,
  roadwayEditPanelPosition: null,
  tileHighlight: DEFAULT_TILE_HIGHLIGHT,
  tileHighlightPanelPosition: null
};

const MARKER_VISIBILITY_KEYS = [
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
  "riftOverlays",
  "sectorGrid",
  "towers",
  "towerNames"
] as const;

const MARKER_COLOR_KEYS = [
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
  "towers"
] as const;

const MARKER_OPACITY_KEYS = [
  "bridges",
  "canals",
  "deeds",
  "highways",
  "locateSouls",
  "missionGrid",
  "notes",
  "riftOverlays",
  "sectorGrid",
  "towers"
] as const;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_STORED_PANEL_POSITION_PX = 10000;
const MAX_STORED_PANEL_SIZE_PX = 10000;

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
    eventFeedPanelSize: parsePanelSize(source.eventFeedPanelSize, fallback.eventFeedPanelSize),
    markerColors: parseMarkerColors(source.markerColors, fallback.markerColors),
    markerOpacities: parseMarkerOpacities(source.markerOpacities, fallback.markerOpacities),
    markerVisibility: parseMarkerVisibility(source.markerVisibility, fallback.markerVisibility),
    roadwayEditPanelPosition: parsePanelPosition(
      source.roadwayEditPanelPosition,
      fallback.roadwayEditPanelPosition
    ),
    tileHighlight: parseTileHighlight(source.tileHighlight, fallback.tileHighlight),
    tileHighlightPanelPosition: parsePanelPosition(
      source.tileHighlightPanelPosition,
      fallback.tileHighlightPanelPosition
    )
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
