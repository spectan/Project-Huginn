import { render } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";
import type {
  CampWorkspaceMarker,
  DeedWorkspaceMarker,
  LocateSoulWorkspaceMarker,
  MinedoorWorkspaceMarker,
  NoteWorkspaceMarker,
  PathWorkspaceMarker,
  RiftWorkspaceMarker,
  TowerWorkspaceMarker
} from "@/lib/markers/marker-types";
import MapWorkspace from "./map-workspace";

export const approvedViewer = {
  approvalStatus: "APPROVED",
  isAdmin: true,
  mapPermissions: [],
  pendingApprovalCount: 0,
  permissions: "WRITE",
  username: "Admin"
} as const;

export const sharedViewer = {
  ...approvedViewer,
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ],
  permissions: "READ",
  username: "Shared view"
} as const;

export const activeMap = {
  heightPx: 2048,
  id: "map-1",
  imageSrc: "/maps/wurm-map.png",
  layers: [
    {
      heightPx: 2048,
      id: "layer-terrain",
      imageSrc: "/maps/wurm-map.png",
      isDefault: true,
      name: "Terrain",
      widthPx: 2048
    },
    {
      heightPx: 2048,
      id: "layer-topographical",
      imageSrc: "/maps/celebration-topo.png",
      isDefault: false,
      name: "Topographical",
      widthPx: 2048
    }
  ],
  name: "Celebration",
  widthPx: 2048
} as const;

type MapWorkspaceProps = React.ComponentProps<typeof MapWorkspace>;

/** Renders MapWorkspace for an approved admin on `activeMap` with no markers, unless overridden. */
export function renderWorkspace(props: Partial<MapWorkspaceProps> = {}) {
  return render(React.createElement(MapWorkspace, {
    initialMarkers: [],
    map: activeMap,
    viewer: approvedViewer,
    ...props
  }));
}

export function mockClipboardWrite() {
  const writeText = vi.fn(async () => undefined);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });

  return writeText;
}

export const makeTower = (overrides: Partial<TowerWorkspaceMarker> = {}): TowerWorkspaceMarker => ({
  damage: "1.25",
  id: "tower-1",
  makerName: "Mako",
  makerNumber: "945",
  ql: "88.50",
  type: "tower",
  x: 250,
  y: 300,
  ...overrides
});

export const makeDeed = (overrides: Partial<DeedWorkspaceMarker> = {}): DeedWorkspaceMarker => ({
  east: 5,
  foundingDate: null,
  founder: "Founder",
  id: "deed-1",
  name: "Oak Harbour",
  north: 5,
  perimeter: 5,
  south: 5,
  type: "deed",
  west: 5,
  x: 500,
  y: 600,
  ...overrides
});

export const makeNote = (overrides: Partial<NoteWorkspaceMarker> = {}): NoteWorkspaceMarker => ({
  category: "General",
  id: "note-1",
  text: "Scout here",
  title: "Scout note",
  type: "note",
  x: 700,
  y: 800,
  ...overrides
});

export const makeRift = (overrides: Partial<RiftWorkspaceMarker> = {}): RiftWorkspaceMarker => ({
  arrivalDate: "2026-05-10",
  estimatedRiftTime: "2026-05-10T18:30",
  id: "rift-1",
  notes: "Bring cotton",
  type: "rift",
  x: 900,
  y: 1000,
  ...overrides
});

export const makeCamp = (overrides: Partial<CampWorkspaceMarker> = {}): CampWorkspaceMarker => ({
  campType: "Goblin",
  id: "camp-1",
  notes: "",
  type: "camp",
  x: 910,
  y: 1010,
  ...overrides
});

export const makeMinedoor = (overrides: Partial<MinedoorWorkspaceMarker> = {}): MinedoorWorkspaceMarker => ({
  id: "minedoor-1",
  notes: "Hidden entrance",
  strength: "73ql",
  type: "minedoor",
  x: 920,
  y: 1020,
  ...overrides
});

export const makeLocateSoul = (overrides: Partial<LocateSoulWorkspaceMarker> = {}): LocateSoulWorkspaceMarker => ({
  casterFacing: "north",
  direction: "aheadLeft",
  distanceBand: "50-199",
  id: "locate-soul-1",
  notes: "Corpse result",
  targetName: "Funkiey",
  type: "locateSoul",
  x: 930,
  y: 1030,
  ...overrides
});

const PATH_DEFAULTS = {
  bridge: { id: "bridge-1", name: "Cedar Bridge", notes: "River crossing", x: 100, xEnd: 140, y: 120 },
  canal: { id: "canal-1", name: "West Canal", notes: "Boat route", x: 110, xEnd: 150, y: 150 },
  highway: { id: "highway-1", name: "East Road", notes: "Main route", x: 120, xEnd: 180, y: 130 },
  tunnel: { id: "tunnel-1", name: "North Tunnel", notes: "Mine route", x: 130, xEnd: 170, y: 180 }
} as const;

/** A two-point, width-2 path of the given type starting at its default coordinate. */
export function makePath(type: PathWorkspaceMarker["type"], overrides: Partial<PathWorkspaceMarker> = {}): PathWorkspaceMarker {
  const { id, name, notes, x, xEnd, y } = PATH_DEFAULTS[type];

  return { id, name, notes, points: [{ x, y }, { x: xEnd, y }], type, width: 2, x, y, ...overrides };
}
