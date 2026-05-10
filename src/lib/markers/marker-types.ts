export type WorkspaceMap = {
  heightPx: number;
  id: string;
  imageSrc: string;
  name: string;
  widthPx: number;
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
  founder: string;
  id: string;
  name: string;
  north: number;
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

export type WorkspaceMarker =
  | TowerWorkspaceMarker
  | DeedWorkspaceMarker
  | NoteWorkspaceMarker;

export type MarkerType = WorkspaceMarker["type"];

export type MarkerVisibility = {
  deeds: boolean;
  deedNames: boolean;
  missionGrid: boolean;
  notes: boolean;
  overlays: boolean;
  sectorGrid: boolean;
  towers: boolean;
  towerNames: boolean;
};

export type MarkerColors = {
  deeds: string;
  missionGrid: string;
  notes: string;
  sectorGrid: string;
  towers: string;
};

export type MarkerOpacities = {
  deeds: number;
  missionGrid: number;
  notes: number;
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
