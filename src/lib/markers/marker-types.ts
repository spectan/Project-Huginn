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
  makerName: string;
  makerNumber: string;
  ql: string;
  type: "tower";
  x: number;
  y: number;
};

export type DeedWorkspaceMarker = {
  east: number;
  foundingDate: string | null;
  founder: string;
  id: string;
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
  text: string;
  title: string;
  type: "note";
  x: number;
  y: number;
};

export type RiftWorkspaceMarker = {
  arrivalDate: string | null;
  estimatedRiftTime: string | null;
  id: string;
  notes: string;
  type: "rift";
  x: number;
  y: number;
};

export type CampWorkspaceMarker = {
  campType: "Rift" | "Goblin";
  id: string;
  notes: string;
  type: "camp";
  x: number;
  y: number;
};

export type MinedoorWorkspaceMarker = {
  id: string;
  notes: string;
  strength: string;
  type: "minedoor";
  x: number;
  y: number;
};

export type PathWorkspaceMarker = {
  id: string;
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
  | RiftWorkspaceMarker
  | CampWorkspaceMarker
  | MinedoorWorkspaceMarker
  | PathWorkspaceMarker;

export type MarkerType = WorkspaceMarker["type"];

export type MarkerVisibility = {
  bridges: boolean;
  camps: boolean;
  canals: boolean;
  deeds: boolean;
  deedNames: boolean;
  deedPerimeters: boolean;
  highwayDetails: boolean;
  highways: boolean;
  minedoors: boolean;
  missionGrid: boolean;
  notes: boolean;
  overlays: boolean;
  riftOverlays: boolean;
  sectorGrid: boolean;
  towers: boolean;
  towerNames: boolean;
};

export type MarkerColors = {
  bridges: string;
  camps: string;
  canals: string;
  deeds: string;
  highways: string;
  minedoors: string;
  missionGrid: string;
  notes: string;
  sectorGrid: string;
  towers: string;
};

export type MarkerOpacities = {
  deeds: number;
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
  id: string;
  name: string;
};
