import type {
  LocateSoulCasterFacing,
  LocateSoulDirection,
  LocateSoulDistanceBandKey
} from "@/lib/domain/locate-soul";
import { PATH_TYPES, type PathType, type TowerType } from "@/lib/domain/markers";
import type { NoteCategoryMarkerShape } from "@/lib/domain/note-categories";

export type WorkspaceMapLayer = {
  heightPx: number;
  id: string;
  imageSrc: string;
  isDefault: boolean;
  name: string;
  widthPx: number;
};

export type WorkspaceMap = {
  heightPx: number;
  id: string;
  imageSrc: string;
  layers: readonly WorkspaceMapLayer[];
  name: string;
  widthPx: number;
};

export type WorkspaceServer = {
  id: string;
  name: string;
};

export type TowerWorkspaceMarker = {
  damage: string;
  id: string;
  lastModifiedBy?: string;
  makerName: string;
  makerNumber: string;
  planned?: boolean;
  ql: string;
  towerType?: TowerType;
  type: "tower";
  x: number;
  y: number;
};

export type DeedWorkspaceMarker = {
  east: number;
  foundingDate: string | null;
  founder: string;
  id: string;
  lastModifiedBy?: string;
  name: string;
  north: number;
  perimeter: number;
  south: number;
  type: "deed";
  west: number;
  x: number;
  y: number;
};

export type NoteWorkspaceMarker = {
  category: string;
  id: string;
  lastModifiedBy?: string;
  text: string;
  title: string;
  type: "note";
  x: number;
  y: number;
};

export type AnnotationWorkspaceMarker = {
  id: string;
  text: string;
  title: string;
  type: "annotation";
  x: number;
  y: number;
};

export type RiftWorkspaceMarker = {
  arrivalDate: string | null;
  estimatedRiftTime: string | null;
  id: string;
  lastModifiedBy?: string;
  notes: string;
  type: "rift";
  x: number;
  y: number;
};

export type CampWorkspaceMarker = {
  campType: "Rift" | "Goblin";
  id: string;
  lastModifiedBy?: string;
  notes: string;
  type: "camp";
  x: number;
  y: number;
};

export type MinedoorWorkspaceMarker = {
  id: string;
  lastModifiedBy?: string;
  notes: string;
  strength: string;
  type: "minedoor";
  x: number;
  y: number;
};

export type LocateSoulWorkspaceMarker = {
  casterFacing: LocateSoulCasterFacing;
  direction: LocateSoulDirection;
  distanceBand: LocateSoulDistanceBandKey;
  id: string;
  lastModifiedBy?: string;
  notes: string;
  targetName: string;
  type: "locateSoul";
  x: number;
  y: number;
};

export type PathWorkspaceMarker = {
  id: string;
  lastModifiedBy?: string;
  name: string;
  notes: string;
  points: Array<{ x: number; y: number }>;
  type: PathType;
  width: number;
  x: number;
  y: number;
};

export type WorkspaceMarker =
  | TowerWorkspaceMarker
  | DeedWorkspaceMarker
  | NoteWorkspaceMarker
  | AnnotationWorkspaceMarker
  | RiftWorkspaceMarker
  | CampWorkspaceMarker
  | MinedoorWorkspaceMarker
  | LocateSoulWorkspaceMarker
  | PathWorkspaceMarker;

export type MarkerType = WorkspaceMarker["type"];

// Marker types stored in their own tables (annotations are not persisted).
export const PERSISTED_MARKER_TYPES = [
  "tower", "deed", "note", "rift", "camp", "minedoor", "locateSoul", ...PATH_TYPES
] as const satisfies readonly MarkerType[];
export type PersistedMarkerType = typeof PERSISTED_MARKER_TYPES[number];

// One kind per marker table: every path type shares the path table.
export type MarkerKind = Exclude<PersistedMarkerType, PathType> | "path";

export const MARKER_AUDIT_TARGETS = {
  camp: "CAMP",
  deed: "DEED",
  locateSoul: "LOCATE_SOUL",
  minedoor: "MINEDOOR",
  note: "NOTE",
  path: "PATH",
  rift: "RIFT",
  tower: "TOWER"
} as const satisfies Record<MarkerKind, string>;
export type MarkerAuditTarget = typeof MARKER_AUDIT_TARGETS[MarkerKind];

export function isPathMarkerType(value: string): value is PathType {
  return PATH_TYPES.some((pathType) => pathType === value);
}

export function isPersistedMarkerType(value: string): value is PersistedMarkerType {
  return PERSISTED_MARKER_TYPES.some((markerType) => markerType === value);
}

export function getMarkerKind(markerType: PersistedMarkerType): MarkerKind {
  return isPathMarkerType(markerType) ? "path" : markerType;
}

export type MarkerVisibility = {
  annotations: boolean;
  bridges: boolean;
  camps: boolean;
  canals: boolean;
  deeds: boolean;
  deedNames: boolean;
  deedPerimeters: boolean;
  highways: boolean;
  locateSouls: boolean;
  minedoors: boolean;
  missionGrid: boolean;
  notes: boolean;
  overlays: boolean;
  plannedTowers: boolean;
  riftOverlays: boolean;
  sectorGrid: boolean;
  towers: boolean;
  towerNames: boolean;
  tunnels: boolean;
  wildernessOverlay: boolean;
};

export type MarkerColors = {
  annotations: string;
  bridges: string;
  camps: string;
  canals: string;
  deeds: string;
  highways: string;
  locateSouls: string;
  minedoors: string;
  missionGrid: string;
  notes: string;
  rifts: string;
  sectorGrid: string;
  towers: string;
  tunnels: string;
  wildernessOverlay: string;
};

export type MarkerOpacities = {
  annotations: number;
  bridges: number;
  canals: number;
  deeds: number;
  highways: number;
  locateSouls: number;
  missionGrid: number;
  notes: number;
  riftOverlays: number;
  sectorGrid: number;
  towers: number;
  tunnels: number;
  wildernessOverlay: number;
};

export type TileHighlightSettings = {
  color: string;
  opacity: number;
  selection: string;
};

export type NoteCategory = {
  color: string | null;
  id: string;
  markerShape: NoteCategoryMarkerShape;
  name: string;
  pipSize: number;
};
