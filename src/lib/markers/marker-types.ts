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
  notes: boolean;
  overlays: boolean;
  towers: boolean;
};

export type MarkerColors = {
  deeds: string;
  notes: string;
  towers: string;
};

export type NoteCategory = {
  id: string;
  name: string;
};
