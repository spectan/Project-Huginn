import type {
  LocateSoulCasterFacing,
  LocateSoulDirection,
  LocateSoulDistanceBandKey
} from "@/lib/domain/locate-soul";
import type { TowerType } from "@/lib/domain/markers";
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
  type: "bridge" | "canal" | "highway";
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
