"use client";

import Image from "next/image";
import {
  useCallback,
  createContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useContext,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from "react";
import { DEFAULT_TOWER_TYPE, TOWER_TYPES, formatTowerCreator } from "@/lib/domain/markers";
import { canReadMap, canWriteMarkers } from "@/lib/domain/permissions";
import {
  MAX_PATH_POINTS,
  MAX_PATH_WIDTH_TILES,
  RIFT_OVERLAY_DISTANCE_TILES,
  TOWER_PLACEMENT_DISTANCE_TILES
} from "@/lib/domain/constants";
import {
  LOCATE_SOUL_CASTER_FACINGS,
  formatLocateSoulCasterFacing,
  formatLocateSoulDirection,
  formatLocateSoulDistanceBand,
  getLocateSoulOverlayGeometry,
  parseLocateSoulMessage
} from "@/lib/domain/locate-soul";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_NAME,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import {
  buildTileHighlightOutlineMask,
  getTileHighlightTargetColors,
  isTileHighlightSelection,
  parseHexRgb
} from "@/lib/domain/tile-highlighting";
import {
  DEFAULT_USER_MAP_SETTINGS,
  MIN_EVENT_FEED_PANEL_SIZE,
  type EventFeedPanelSize,
  type NoteCategoryColors,
  type NoteCategoryMarkerShapes,
  type NoteCategoryPipSizes,
  type TileHighlightPanelPosition,
  type UserAnnotation,
  type UserMapSettings
} from "@/lib/map-settings/map-settings";
import type { WurmMapsEvent, WurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerType,
  MarkerVisibility,
  NoteCategory,
  TileHighlightSettings,
  WorkspaceMap,
  WorkspaceMapLayer,
  WorkspaceMarker,
  WorkspaceServer
} from "@/lib/markers/marker-types";
import { AccountOverlay, type AccountViewer } from "./account-overlay";
import { MapSettingsOverlay } from "./map-settings-overlay";
import { MarkerLayer } from "./marker-layer";

const FALLBACK_MAP_SIZE_PX = 2048;
const MAX_ZOOM = 64;
const CLICK_DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_DURATION_MS = 600;
const PINCH_MIN_DISTANCE_PX = 8;
const ZOOM_STEP = 1.2;
const FLOATING_MENU_MARGIN_PX = 12;
const CONTEXT_MENU_MAX_WIDTH_PX = 340;
const CONTEXT_MENU_MAX_HEIGHT_PX = 420;
const HOVER_DETAILS_OFFSET_PX = 14;
const HOVER_DETAILS_MAX_WIDTH_PX = 280;
const HOVER_DETAILS_MAX_HEIGHT_PX = 220;
const SERVER_VIEWPORT_SNAPSHOT = `${FALLBACK_MAP_SIZE_PX}x${FALLBACK_MAP_SIZE_PX}`;
const SECTOR_GRID_LEFT_OFFSET_PX = -16;
const SECTOR_GRID_TOP_OFFSET_PX = 18;
const EVENT_FEED_DISPLAY_LIMIT = 30;
const MAP_TIP_INTERVAL_MS = 15000;
const SECTOR_GRID_COLUMNS = Array.from({ length: 20 }, (_, index) => String(index + 7));
const SECTOR_GRID_ROWS = Array.from({ length: 20 }, (_, index) => String.fromCharCode("B".charCodeAt(0) + index));
const TILE_SIZE_METERS = 4;
const TOWER_AUTOPLANNER_SPACING_TILES = TOWER_PLACEMENT_DISTANCE_TILES * 2;
const DEFAULT_NOTE_CATEGORIES: NoteCategory[] = [
  {
    color: null,
    id: "default-category-general",
    markerShape: DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
    name: DEFAULT_NOTE_CATEGORY_NAME,
    pipSize: DEFAULT_NOTE_CATEGORY_PIP_SIZE
  }
];
const MAP_FOOTER_TIPS = [
  "You can quick-plan deeds by holding down shift and click-dragging a box of whatever size.",
  "You can quick-plan towers by opening an existing tower, checking the \"Planned\" box, and clicking around while holding down the CTRL key.",
  "All colours and opacities can be configured in the settings cogwheel in the top right.",
  "You can change the map type by interacting with the drop-down under the search bar that says \"Terrain\". You can change servers here too!",
  "Did you know that accidentally deleted items can be recovered for up to 72 hours? Contact an administrator!",
  "Did you know you can shift-click and drag while in the edit menu of a deed to quick resize it?",
  "Note settings are all user specific. The only thing that is shared are category names.",
  "You can use the Quick Input field on new towers to paste a log directly from Wurm and have the information auto-fill."
] as const;
const SERVER_CLUSTER_ORDER = [
  "Epic",
  "Northern Freedom Isles",
  "Southern Freedom Isles",
] as const;
const SERVER_CLUSTERS = new Map<string, typeof SERVER_CLUSTER_ORDER[number]>([
  ["Celebration", "Southern Freedom Isles"],
  ["Chaos", "Southern Freedom Isles"],
  ["Deliverance", "Southern Freedom Isles"],
  ["Exodus", "Southern Freedom Isles"],
  ["Independence", "Southern Freedom Isles"],
  ["Pristine", "Southern Freedom Isles"],
  ["Release", "Southern Freedom Isles"],
  ["Xanadu", "Southern Freedom Isles"],
  ["Cadence", "Northern Freedom Isles"],
  ["Defiance", "Northern Freedom Isles"],
  ["Harmony", "Northern Freedom Isles"],
  ["Melody", "Northern Freedom Isles"],
  ["Affliction", "Epic"],
  ["Desertion", "Epic"],
  ["Elevation", "Epic"],
  ["Serenity", "Epic"]
]);
const tileSourceImageDataCache = new Map<string, Promise<ImageData>>();

type ViewState = {
  x: number;
  y: number;
  zoom: number;
};

type DragState = {
  hasMoved: boolean;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startZoom: number;
};

type TouchPointerState = {
  clientX: number;
  clientY: number;
  pointerId: number;
};

type PinchZoomState = {
  pointerIds: [number, number];
  startDistance: number;
  startMapX: number;
  startMapY: number;
  startZoom: number;
};

type LongPressState = {
  clientX: number;
  clientY: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  timeoutId: number;
  view: ViewState;
};

type ViewportSize = {
  height: number;
  width: number;
};

type MapCoordinate = {
  x: number;
  y: number;
};

type ContextMenuState = {
  screenX: number;
  screenY: number;
  view: ViewState;
} & (
  | {
      mapX: number;
      mapY: number;
      mode: "map";
    }
  | {
      mapX: number;
      mapY: number;
      markers: WorkspaceMarker[];
      mode: "marker";
    }
);

type DeedDirectionalDimensions = {
  east: number;
  north: number;
  south: number;
  west: number;
};

type DialogState =
  | {
      initialDeedDimensions?: DeedDirectionalDimensions;
      markerType: MarkerType;
      mode: "create";
      x: number;
      y: number;
    }
  | { marker: WorkspaceMarker; mode: "edit" };

type HoveredMarkerState = {
  coordinate: MapCoordinate;
  markers: WorkspaceMarker[];
  screenX: number;
  screenY: number;
};

type PathMarkerType = Extract<MarkerType, "bridge" | "canal" | "highway" | "tunnel">;

type PathDraftState = {
  id?: string;
  mode: "create" | "edit";
  name: string;
  notes: string;
  points: MapCoordinate[];
  type: PathMarkerType;
  width: number;
};

type PathPointDragState = {
  pointIndex: number;
  pointerId: number;
};

type MarkerRelocationDragState = {
  markerId: string;
  pointerId: number;
};

type DeedResizeDragState = {
  horizontalSide: "east" | "west";
  markerId: string;
  pointerId: number;
  verticalSide: "north" | "south";
  view: ViewState;
};

type QuickDeedDragState = {
  end: MapCoordinate;
  hasMoved: boolean;
  pointerId: number;
  start: MapCoordinate;
  startClientX: number;
  startClientY: number;
  view: ViewState;
};

type QuickDeedDraftState = {
  end: MapCoordinate;
  start: MapCoordinate;
};

type EventFeedResizeDragState = {
  horizontalDirection: -1 | 1;
  maxHeight: number;
  maxWidth: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startHeight: number;
  startWidth: number;
  verticalDirection: -1 | 1;
};

type EventFeedResizeHandleDefinition = {
  horizontalDirection: -1 | 1;
  id: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  verticalDirection: -1 | 1;
};

const EVENT_FEED_RESIZE_HANDLES: EventFeedResizeHandleDefinition[] = [
  { horizontalDirection: -1, id: "top-left", verticalDirection: -1 },
  { horizontalDirection: 1, id: "top-right", verticalDirection: -1 },
  { horizontalDirection: -1, id: "bottom-left", verticalDirection: 1 },
  { horizontalDirection: 1, id: "bottom-right", verticalDirection: 1 }
];

const MapIdContext = createContext<string | undefined>(undefined);

type TopPanelState = "account" | "settings" | null;

type NoteCategoryEditorInput = {
  name: string;
};

type MapWorkspaceProps = {
  initialEventFeed?: WurmMapsEventFeed | null;
  initialMarkers: WorkspaceMarker[];
  initialNoteCategories?: readonly NoteCategory[];
  initialSettings?: UserMapSettings;
  map: WorkspaceMap | null;
  selectedLayerId?: string;
  servers?: readonly WorkspaceServer[];
  viewer: AccountViewer | null;
};

export default function MapWorkspace({
  initialEventFeed,
  initialMarkers,
  initialNoteCategories = DEFAULT_NOTE_CATEGORIES,
  initialSettings = DEFAULT_USER_MAP_SETTINGS,
  map,
  selectedLayerId,
  servers = [],
  viewer
}: MapWorkspaceProps) {
  const viewport = useViewportSize();
  const mapLayers = useMemo(() => getWorkspaceMapLayers(map), [map]);
  const initialSelectedLayerId = useMemo(
    () => getInitialSelectedLayerId(mapLayers, selectedLayerId),
    [mapLayers, selectedLayerId]
  );
  const [selectedMapLayerOverrideId, setSelectedMapLayerOverrideId] = useState<string | null>(null);
  const effectiveSelectedLayerId = selectedMapLayerOverrideId ?? initialSelectedLayerId;
  const selectedMapLayer = useMemo(
    () => mapLayers.find((layer) => layer.id === effectiveSelectedLayerId) ?? mapLayers[0] ?? null,
    [effectiveSelectedLayerId, mapLayers]
  );
  const visualMap = useMemo(
    () => map === null ? null : applyMapLayer(map, selectedMapLayer),
    [map, selectedMapLayer]
  );
  const availableServers = useMemo(() => getAvailableServers(servers, map), [map, servers]);
  const mapSize = getMapSize(visualMap);
  const urlSearchSnapshot = useUrlSearchSnapshot();
  const fittedView = useMemo(() => getFitView(viewport, mapSize), [mapSize, viewport]);
  const urlCoordinate = useMemo(
    () => getUrlCoordinate(visualMap, urlSearchSnapshot),
    [visualMap, urlSearchSnapshot]
  );
  const urlCoordinateView = useMemo(
    () => urlCoordinate === null ? null : getCoordinateView(urlCoordinate, viewport, mapSize),
    [mapSize, urlCoordinate, viewport]
  );
  const [selectedCoordinate, setSelectedCoordinate] = useState<MapCoordinate | null>(null);
  const [manualView, setManualView] = useState<ViewState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [localMarkers, setLocalMarkers] = useState<WorkspaceMarker[] | null>(null);
  const [annotations, setAnnotations] = useState<UserAnnotation[]>(initialSettings.annotations);
  const [formError, setFormError] = useState<string | null>(null);
  const [favoriteServerId, setFavoriteServerId] = useState<string | null>(initialSettings.favoriteServerId);
  const [markerVisibility, setMarkerVisibility] = useState<MarkerVisibility>(initialSettings.markerVisibility);
  const [markerColors, setMarkerColors] = useState<MarkerColors>(initialSettings.markerColors);
  const [markerOpacities, setMarkerOpacities] = useState<MarkerOpacities>(initialSettings.markerOpacities);
  const [noteCategoryColors, setNoteCategoryColors] = useState<NoteCategoryColors>(initialSettings.noteCategoryColors);
  const [noteCategoryMarkerShapes, setNoteCategoryMarkerShapes] =
    useState<NoteCategoryMarkerShapes>(initialSettings.noteCategoryMarkerShapes);
  const [noteCategoryPipSizes, setNoteCategoryPipSizes] =
    useState<NoteCategoryPipSizes>(initialSettings.noteCategoryPipSizes);
  const [eventFeedPanelSize, setEventFeedPanelSize] =
    useState<EventFeedPanelSize>(initialSettings.eventFeedPanelSize);
  const [topPanel, setTopPanel] = useState<TopPanelState>(null);
  const [roadwayEditMode, setRoadwayEditMode] = useState(false);
  const [roadwayEditPanelPosition, setRoadwayEditPanelPosition] =
    useState<TileHighlightPanelPosition | null>(initialSettings.roadwayEditPanelPosition);
  const [tileHighlight, setTileHighlight] = useState<TileHighlightSettings>(initialSettings.tileHighlight);
  const [tileHighlightPanelPosition, setTileHighlightPanelPosition] =
    useState<TileHighlightPanelPosition | null>(initialSettings.tileHighlightPanelPosition);
  const [hoveredMarker, setHoveredMarker] = useState<HoveredMarkerState | null>(null);
  const [pathDraft, setPathDraft] = useState<PathDraftState | null>(null);
  const pathDraftRef = useRef<PathDraftState | null>(pathDraft);
  const [quickDeedDraft, setQuickDeedDraft] = useState<QuickDeedDraftState | null>(null);
  const [routePlannerEnabled, setRoutePlannerEnabled] = useState(false);
  const [routePlannerPoints, setRoutePlannerPoints] = useState<MapCoordinate[] | null>(null);
  const [routePlannerSpeedKmh, setRoutePlannerSpeedKmh] = useState(initialSettings.routePlannerSpeedKmh);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isEventFeedOpen, setIsEventFeedOpen] = useState(false);
  const [eventFeedState, setEventFeedState] = useState<{
    feed: WurmMapsEventFeed | null;
    mapId: string | null;
  }>({
    feed: initialEventFeed ?? null,
    mapId: map?.id ?? null
  });
  const [isEventFeedLoading, setIsEventFeedLoading] = useState(false);
  const [footerTipIndex, setFooterTipIndex] = useState(0);
  const [noteCategories, setNoteCategories] = useState<NoteCategory[]>(
    Array.from(initialNoteCategories.length === 0 ? DEFAULT_NOTE_CATEGORIES : initialNoteCategories)
      .map(normalizeNoteCategory)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLinesEnabled, setSearchLinesEnabled] = useState(initialSettings.searchLinesEnabled);
  const dragRef = useRef<DragState | null>(null);
  const activeTouchPointersRef = useRef<Map<number, TouchPointerState>>(new Map());
  const pinchZoomRef = useRef<PinchZoomState | null>(null);
  const longPressRef = useRef<LongPressState | null>(null);
  const pathPointDragRef = useRef<PathPointDragState | null>(null);
  const markerRelocationDragRef = useRef<MarkerRelocationDragState | null>(null);
  const deedResizeDragRef = useRef<DeedResizeDragState | null>(null);
  const quickDeedDragRef = useRef<QuickDeedDragState | null>(null);
  const hasInitializedSettingsSaveRef = useRef(false);
  const view = manualView ?? urlCoordinateView ?? fittedView;
  const markers = localMarkers ?? initialMarkers;
  const allMarkers = useMemo(() => [...markers, ...annotations], [annotations, markers]);
  const searchTerm = searchQuery.trim().toLowerCase();
  const displayedMarkers = useMemo(
    () => searchTerm.length === 0
      ? allMarkers
      : allMarkers.filter((marker) => markerMatchesSearch(marker, searchTerm)),
    [allMarkers, searchTerm]
  );
  const highlightedMarkerIds = useMemo(
    () => searchTerm.length === 0 ? new Set<string>() : new Set(displayedMarkers.map((marker) => marker.id)),
    [displayedMarkers, searchTerm.length]
  );
  const displayedMarkersWithEditPreview = useMemo(
    () => {
      if (pathDraft?.mode === "edit" && pathDraft.id !== undefined) {
        return displayedMarkers.filter((marker) => marker.id !== pathDraft.id);
      }

      if (dialog === null || dialog.mode !== "edit" || isPathMarker(dialog.marker)) {
        return displayedMarkers;
      }

      return displayedMarkers.map((marker) => marker.id === dialog.marker.id ? dialog.marker : marker);
    },
    [dialog, displayedMarkers, pathDraft]
  );
  const hoveredMarkers = hoveredMarker?.markers ?? [];
  const hiddenDeedLabelId = hoveredMarkers.find((marker) => marker.type === "deed")?.id ?? null;
  const hiddenTowerLabelId = hoveredMarkers.find((marker) => marker.type === "tower")?.id ?? null;
  const renderedSelectedCoordinate = selectedCoordinate ?? urlCoordinate;
  const eventFeedMapId = map?.id ?? null;
  const eventFeed = eventFeedState.mapId === eventFeedMapId ? eventFeedState.feed : initialEventFeed ?? null;
  const canViewMap = map !== null && viewer !== null && canReadMap({
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin,
    mapPermissions: viewer.mapPermissions
  }, map.id);
  const canWriteMapMarkers = map !== null && viewer !== null && canWriteMarkers({
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin,
    mapPermissions: viewer.mapPermissions
  }, map.id);
  const userMapSettings = useMemo<UserMapSettings>(() => ({
    annotations,
    eventFeedPanelSize,
    favoriteServerId,
    markerColors,
    markerOpacities,
    markerVisibility,
    noteCategoryColors,
    noteCategoryMarkerShapes,
    noteCategoryPipSizes,
    roadwayEditPanelPosition,
    routePlannerSpeedKmh,
    searchLinesEnabled,
    tileHighlight,
    tileHighlightPanelPosition
  }), [
    annotations,
    eventFeedPanelSize,
    favoriteServerId,
    markerColors,
    markerOpacities,
    markerVisibility,
    noteCategoryColors,
    noteCategoryMarkerShapes,
    noteCategoryPipSizes,
    roadwayEditPanelPosition,
    routePlannerSpeedKmh,
    searchLinesEnabled,
    tileHighlight,
    tileHighlightPanelPosition
  ]);

  const updateMarkers = useCallback(
    (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => {
      setLocalMarkers((current) => updater(current ?? initialMarkers));
    },
    [initialMarkers]
  );
  const resetUserMapSettings = useCallback(() => {
    setEventFeedPanelSize(DEFAULT_USER_MAP_SETTINGS.eventFeedPanelSize);
    setFavoriteServerId(DEFAULT_USER_MAP_SETTINGS.favoriteServerId);
    setMarkerColors(DEFAULT_USER_MAP_SETTINGS.markerColors);
    setMarkerOpacities(DEFAULT_USER_MAP_SETTINGS.markerOpacities);
    setMarkerVisibility(DEFAULT_USER_MAP_SETTINGS.markerVisibility);
    setNoteCategoryColors(DEFAULT_USER_MAP_SETTINGS.noteCategoryColors);
    setNoteCategoryMarkerShapes(DEFAULT_USER_MAP_SETTINGS.noteCategoryMarkerShapes);
    setNoteCategoryPipSizes(DEFAULT_USER_MAP_SETTINGS.noteCategoryPipSizes);
    setRoadwayEditPanelPosition(DEFAULT_USER_MAP_SETTINGS.roadwayEditPanelPosition);
    setRoutePlannerSpeedKmh(DEFAULT_USER_MAP_SETTINGS.routePlannerSpeedKmh);
    setSearchLinesEnabled(DEFAULT_USER_MAP_SETTINGS.searchLinesEnabled);
    setTileHighlight(DEFAULT_USER_MAP_SETTINGS.tileHighlight);
    setTileHighlightPanelPosition(DEFAULT_USER_MAP_SETTINGS.tileHighlightPanelPosition);
  }, []);
  useLayoutEffect(() => {
    pathDraftRef.current = pathDraft;
  }, [pathDraft]);

  const toggleRoutePlanner = useCallback(() => {
    setRoutePlannerEnabled((current) => {
      if (current) {
        setRoutePlannerPoints(null);
      }

      return !current;
    });
  }, []);

  const showNextFooterTip = useCallback(() => {
    setFooterTipIndex((current) => (current + 1) % MAP_FOOTER_TIPS.length);
  }, []);

  const loadEventFeed = useCallback(async () => {
    if (map === null) {
      return;
    }

    setIsEventFeedLoading(true);

    try {
      const response = await fetch(`/api/maps/${map.id}/events`);

      if (!response.ok) {
        setEventFeedState({ feed: null, mapId: map.id });
        return;
      }

      const body = (await response.json().catch(() => null)) as { feed?: WurmMapsEventFeed } | null;
      setEventFeedState({ feed: body?.feed ?? null, mapId: map.id });
    } catch {
      setEventFeedState({ feed: null, mapId: map.id });
    } finally {
      setIsEventFeedLoading(false);
    }
  }, [map]);

  const handleEventFeedOpenChange = useCallback((isOpen: boolean) => {
    setIsEventFeedOpen(isOpen);

    if (isOpen && eventFeed === null && !isEventFeedLoading) {
      void loadEventFeed();
    }
  }, [eventFeed, isEventFeedLoading, loadEventFeed]);

  useEffect(() => {
    const intervalId = window.setInterval(showNextFooterTip, MAP_TIP_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [showNextFooterTip]);

  const createNoteCategory = useCallback(async (input: NoteCategoryEditorInput): Promise<NoteCategory | null> => {
    if (map === null) {
      return null;
    }

    const response = await fetch(`/api/maps/${map.id}/note-categories`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { category: NoteCategory };
    setNoteCategories((current) => upsertNoteCategory(current, body.category));
    return body.category;
  }, [map]);
  const updateNoteCategoryColor = useCallback((categoryId: string, color: string | null) => {
    setNoteCategoryColors((current) => {
      const nextColors = { ...current };

      if (color === null) {
        delete nextColors[categoryId];
      } else {
        nextColors[categoryId] = color;
      }

      return nextColors;
    });
  }, []);
  const updateNoteCategoryMarkerShape = useCallback((categoryId: string, markerShape: NoteCategoryMarkerShape) => {
    setNoteCategoryMarkerShapes((current) => ({
      ...current,
      [categoryId]: markerShape
    }));
  }, []);
  const updateNoteCategoryPipSize = useCallback((categoryId: string, pipSize: number) => {
    setNoteCategoryPipSizes((current) => ({
      ...current,
      [categoryId]: pipSize
    }));
  }, []);
  const clearNoteCategoryPresentation = useCallback((categoryId: string) => {
    updateNoteCategoryColor(categoryId, null);
    setNoteCategoryMarkerShapes((current) => {
      const nextMarkerShapes = { ...current };
      delete nextMarkerShapes[categoryId];
      return nextMarkerShapes;
    });
    setNoteCategoryPipSizes((current) => {
      const nextPipSizes = { ...current };
      delete nextPipSizes[categoryId];
      return nextPipSizes;
    });
  }, [updateNoteCategoryColor]);
  const updateNoteCategory = useCallback(async (
    categoryId: string,
    input: NoteCategoryEditorInput
  ): Promise<NoteCategory | null> => {
    if (map === null) {
      return null;
    }

    const previousCategory = noteCategories.find((category) => category.id === categoryId) ?? null;
    const response = await fetch(`/api/maps/${map.id}/note-categories/${categoryId}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { category: NoteCategory };
    setNoteCategories((current) => upsertNoteCategory(current, body.category));

    if (previousCategory !== null && previousCategory.name !== body.category.name) {
      updateMarkers((current) => current.map((marker) => (
        marker.type === "note" && marker.category === previousCategory.name
          ? { ...marker, category: body.category.name }
          : marker
      )));
    }

    return body.category;
  }, [map, noteCategories, updateMarkers]);
  const deleteNoteCategory = useCallback(async (categoryId: string): Promise<boolean> => {
    if (map === null) {
      return false;
    }

    const previousCategory = noteCategories.find((category) => category.id === categoryId) ?? null;
    const response = await fetch(`/api/maps/${map.id}/note-categories/${categoryId}`, { method: "DELETE" });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { category: { id: string; reassignedTo: string } };
    setNoteCategories((current) => current.filter((category) => category.id !== body.category.id));
    clearNoteCategoryPresentation(body.category.id);

    if (previousCategory !== null) {
      updateMarkers((current) => current.map((marker) => (
        marker.type === "note" && marker.category === previousCategory.name
          ? { ...marker, category: body.category.reassignedTo }
          : marker
      )));
    }

    return true;
  }, [clearNoteCategoryPresentation, map, noteCategories, updateMarkers]);
  const startCreateMarker = useCallback((markerType: MarkerType, coordinate: MapCoordinate, creationView: ViewState = view) => {
    setFormError(null);
    setContextMenu(null);
    setQuickDeedDraft(null);

    if (isPathMarkerType(markerType)) {
      setManualView(creationView);
      setPathDraft({
        mode: "create",
        name: "",
        notes: "",
        points: [coordinate],
        type: markerType,
        width: 1
      });
      return;
    }

    setDialog({
      markerType,
      mode: "create",
      x: coordinate.x,
      y: coordinate.y
    });
  }, [view]);
  const startEditMarker = useCallback((marker: WorkspaceMarker) => {
    setFormError(null);
    setContextMenu(null);
    setQuickDeedDraft(null);

    if (isPathMarker(marker)) {
      setPathDraft({
        id: marker.id,
        mode: "edit",
        name: marker.name,
        notes: marker.notes,
        points: marker.points,
        type: marker.type,
        width: marker.width
      });
      return;
    }

    setDialog({ marker, mode: "edit" });
  }, []);
  const handlePathPointPointerDown = useCallback((pointIndex: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPrimaryPointerButton(event.button)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pathPointDragRef.current = {
      pointIndex,
      pointerId: event.pointerId
    };
  }, []);

  const selectCoordinate = useCallback((coordinate: MapCoordinate) => {
    setSelectedCoordinate(coordinate);
    updateBrowserCoordinate(coordinate);
  }, []);

  const zoomAt = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    setManualView((currentManualView) => {
      const current = currentManualView ?? getFitView(viewport, mapSize);
      const minZoom = getFitZoom(viewport, mapSize);

      if (nextZoom <= minZoom) {
        return getFitView(viewport, mapSize);
      }

      const zoom = clamp(nextZoom, minZoom, MAX_ZOOM);
      const mapX = (clientX - current.x) / current.zoom;
      const mapY = (clientY - current.y) / current.zoom;

      return {
        x: clientX - mapX * zoom,
        y: clientY - mapY * zoom,
        zoom
      };
    });
  }, [mapSize, viewport]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      event.preventDefault();
      cancelLongPress(longPressRef);
      setContextMenu(null);
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(view.zoom * factor, event.clientX, event.clientY);
    },
    [view.zoom, zoomAt]
  );

  const getVisibleMarkersAtCoordinate = useCallback(
    (coordinate: MapCoordinate): WorkspaceMarker[] => getHoverMarkersAtCoordinate(
      displayedMarkersWithEditPreview,
      markerVisibility,
      coordinate,
      mapSize,
      { includePathMarkers: true }
    ),
    [displayedMarkersWithEditPreview, mapSize, markerVisibility]
  );

  const showTouchMarkerDetails = useCallback(
    (coordinate: MapCoordinate, clientX: number, clientY: number): boolean => {
      const markersAtCoordinate = getVisibleMarkersAtCoordinate(coordinate);

      if (markersAtCoordinate.length === 0) {
        setHoveredMarker(null);
        return false;
      }

      setHoveredMarker({
        coordinate,
        markers: markersAtCoordinate,
        screenX: clientX,
        screenY: clientY
      });
      return true;
    },
    [getVisibleMarkersAtCoordinate]
  );

  const openCoordinateContextMenu = useCallback(
    (clientX: number, clientY: number, contextView: ViewState): boolean => {
      if (!canViewMap || visualMap === null) {
        return false;
      }

      const coordinate = getMapCoordinate(clientX, clientY, contextView);

      if (!isInsideMap(coordinate, visualMap)) {
        return false;
      }

      const markersAtCoordinate = getHoverMarkersAtCoordinate(
        displayedMarkersWithEditPreview,
        markerVisibility,
        coordinate,
        mapSize,
        { includePathMarkers: roadwayEditMode }
      );
      selectCoordinate(coordinate);
      setHoveredMarker(null);

      if (canWriteMapMarkers && markersAtCoordinate.length > 0) {
        setContextMenu({
          mapX: coordinate.x,
          mapY: coordinate.y,
          markers: markersAtCoordinate,
          mode: "marker",
          screenX: clientX,
          screenY: clientY,
          view: contextView
        });
        return true;
      }

      setContextMenu({
        mapX: coordinate.x,
        mapY: coordinate.y,
        mode: "map",
        screenX: clientX,
        screenY: clientY,
        view: contextView
      });
      return true;
    },
    [canViewMap, canWriteMapMarkers, displayedMarkersWithEditPreview, mapSize, markerVisibility, roadwayEditMode, selectCoordinate, visualMap]
  );

  const startLongPress = useCallback(
    (event: { clientX: number; clientY: number; pointerId: number; pointerType?: string }, contextView: ViewState) => {
      if (event.pointerType !== "touch") {
        return;
      }

      const currentLongPress = longPressRef.current;

      if (currentLongPress?.pointerId === event.pointerId) {
        return;
      }

      cancelLongPress(longPressRef);

      const longPress: LongPressState = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        timeoutId: window.setTimeout(() => {
          if (longPressRef.current?.pointerId !== event.pointerId) {
            return;
          }

          longPressRef.current = null;
          dragRef.current = null;
          pinchZoomRef.current = null;
          setIsDragging(false);
          void openCoordinateContextMenu(longPress.clientX, longPress.clientY, longPress.view);
        }, LONG_PRESS_DURATION_MS),
        view: contextView
      };

      longPressRef.current = longPress;
    },
    [openCoordinateContextMenu]
  );

  const trackTouchPointer = useCallback((event: { clientX: number; clientY: number; pointerId: number; pointerType?: string }) => {
    if (event.pointerType !== "touch") {
      return;
    }

    activeTouchPointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    });
  }, []);

  const startPinchZoomIfReady = useCallback((): boolean => {
    const pointers = Array.from(activeTouchPointersRef.current.values());

    if (pointers.length < 2) {
      return false;
    }

    const firstPointer = pointers[0];
    const secondPointer = pointers[1];

    if (firstPointer === undefined || secondPointer === undefined) {
      return false;
    }

    const startDistance = getPointerDistance(firstPointer, secondPointer);

    if (startDistance < PINCH_MIN_DISTANCE_PX) {
      return false;
    }

    const center = getPointerCenter(firstPointer, secondPointer);
    pinchZoomRef.current = {
      pointerIds: [firstPointer.pointerId, secondPointer.pointerId],
      startDistance,
      startMapX: (center.clientX - view.x) / view.zoom,
      startMapY: (center.clientY - view.y) / view.zoom,
      startZoom: view.zoom
    };
    dragRef.current = null;
    setIsDragging(false);
    cancelLongPress(longPressRef);
    setContextMenu(null);
    setHoveredMarker(null);
    return true;
  }, [view.x, view.y, view.zoom]);

  const startQuickDeedDrag = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      pointerId: number;
      preventDefault(): void;
      shiftKey: boolean;
      stopPropagation?(): void;
    }): boolean => {
      if (
        !event.shiftKey ||
        !canWriteMapMarkers ||
        routePlannerEnabled ||
        pathDraftRef.current !== null ||
        dialog !== null ||
        visualMap === null ||
        quickDeedDragRef.current !== null
      ) {
        return false;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, visualMap)) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation?.();
      setContextMenu(null);
      setHoveredMarker(null);
      quickDeedDragRef.current = {
        end: coordinate,
        hasMoved: false,
        pointerId: event.pointerId,
        start: coordinate,
        startClientX: event.clientX,
        startClientY: event.clientY,
        view
      };
      setQuickDeedDraft({
        end: coordinate,
        start: coordinate
      });
      return true;
    },
    [canWriteMapMarkers, dialog, routePlannerEnabled, view, visualMap]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isPrimaryPointerButton(event.button)) {
        return;
      }

      trackTouchPointer(event);

      if (event.pointerType === "touch") {
        if (activeTouchPointersRef.current.size >= 2) {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          startPinchZoomIfReady();
          return;
        }

        startLongPress(event, view);
      }

      if (startQuickDeedDrag(event)) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        return;
      }

      if (event.shiftKey && canWriteMapMarkers) {
        return;
      }

      if (!event.ctrlKey && !routePlannerEnabled && isInteractivePanTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setContextMenu(null);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        hasMoved: false,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: view.x,
        startY: view.y,
        startZoom: view.zoom
      };
      setIsDragging(true);
    },
    [canWriteMapMarkers, routePlannerEnabled, startLongPress, startPinchZoomIfReady, startQuickDeedDrag, trackTouchPointer, view]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!canViewMap || visualMap === null) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, visualMap)) {
        return;
      }

      event.preventDefault();
      void openCoordinateContextMenu(event.clientX, event.clientY, view);
    },
    [canViewMap, openCoordinateContextMenu, view, visualMap]
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!routePlannerEnabled || !canViewMap || visualMap === null) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, visualMap)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      setRoutePlannerPoints((current) => current === null ? [coordinate] : null);
    },
    [canViewMap, routePlannerEnabled, view, visualMap]
  );

  const handleMarkerContextMenu = useCallback(
    (marker: WorkspaceMarker, event: React.MouseEvent<Element>) => {
      if (!canWriteMapMarkers) {
        return;
      }

      if (isPathMarker(marker) && !roadwayEditMode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const eventCoordinate = getMapCoordinate(event.clientX, event.clientY, view);
      const mapCoordinate = isOverlayContextTarget(event.currentTarget) &&
        visualMap !== null &&
        isInsideMap(eventCoordinate, visualMap)
        ? eventCoordinate
        : { x: marker.x, y: marker.y };
      const markersAtCoordinate = getHoverMarkersAtCoordinate(
        displayedMarkersWithEditPreview,
        markerVisibility,
        mapCoordinate,
        mapSize,
        { includePathMarkers: roadwayEditMode }
      );

      selectCoordinate(mapCoordinate);
      setContextMenu({
        mapX: mapCoordinate.x,
        mapY: mapCoordinate.y,
        markers: getUniqueMarkers(markersAtCoordinate.length === 0
          ? [marker]
          : [...markersAtCoordinate, marker]
        ),
        mode: "marker",
        screenX: event.clientX,
        screenY: event.clientY,
        view
      });
    },
    [canWriteMapMarkers, displayedMarkersWithEditPreview, mapSize, markerVisibility, roadwayEditMode, selectCoordinate, view, visualMap]
  );

  const handleMarkerRelocationPointerDown = useCallback(
    (marker: WorkspaceMarker, event: React.PointerEvent<Element>) => {
      if (
        !isPrimaryPointerButton(event.button) ||
        dialog === null ||
        dialog.mode !== "edit" ||
        dialog.marker.id !== marker.id ||
        isPathMarker(marker)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      markerRelocationDragRef.current = {
        markerId: marker.id,
        pointerId: event.pointerId
      };
      setContextMenu(null);
      setHoveredMarker(null);
    },
    [dialog]
  );

  const handleDeedResizePointerDown = useCallback(
    (marker: WorkspaceMarker, event: React.PointerEvent<Element>) => {
      if (
        !isPrimaryPointerButton(event.button) ||
        !event.shiftKey ||
        dialog === null ||
        dialog.mode !== "edit" ||
        dialog.marker.id !== marker.id ||
        dialog.marker.type !== "deed" ||
        marker.type !== "deed"
      ) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      deedResizeDragRef.current = {
        horizontalSide: coordinate.x <= marker.x ? "west" : "east",
        markerId: marker.id,
        pointerId: event.pointerId,
        verticalSide: coordinate.y <= marker.y ? "north" : "south",
        view
      };
      setContextMenu(null);
      setHoveredMarker(null);
    },
    [dialog, view]
  );

  const finishPointerDrag = useCallback((event: { clientX: number; clientY: number; ctrlKey?: boolean; pointerId: number; pointerType?: string }) => {
    const drag = dragRef.current;

    if (drag === null) {
      return;
    }

    const dragPointerId = drag.pointerId as number | undefined;

    if (dragPointerId !== undefined && dragPointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);

    if (drag.hasMoved || !canViewMap || visualMap === null) {
      return;
    }

    const coordinate = getMapCoordinate(event.clientX, event.clientY, {
      x: drag.startX,
      y: drag.startY,
      zoom: drag.startZoom
    });

    if (isInsideMap(coordinate, visualMap)) {
      const autoplanSourceTower = getAutoplannerSourceTower(dialog);

      if (
        event.ctrlKey === true &&
        canWriteMapMarkers &&
        map !== null &&
        autoplanSourceTower !== null &&
        !routePlannerEnabled &&
        pathDraftRef.current === null
      ) {
        const targetCoordinate = getAutoplannedTowerCoordinate(autoplanSourceTower, coordinate, visualMap);

        if (targetCoordinate === null) {
          setFormError("Planned tower target must stay inside the map");
          return;
        }

        if (hasTowerAtCoordinate(markers, targetCoordinate, autoplanSourceTower.id)) {
          setFormError(`A tower already exists at ${targetCoordinate.x}, ${targetCoordinate.y}`);
          return;
        }

        void createAutoplannedTower(
          targetCoordinate,
          map.id,
          updateMarkers,
          setFormError
        );
        return;
      }

      if (routePlannerEnabled) {
        setRoutePlannerPoints((current) => current === null ? current : appendRoutePlannerPoint(current, coordinate));
        return;
      }

      if (pathDraftRef.current !== null) {
        setPathDraft((current) => current === null
          ? current
          : {
              ...current,
              points: appendPathDraftPoint(current.points, coordinate)
            });
        return;
      }

      if (event.pointerType === "touch" && showTouchMarkerDetails(coordinate, event.clientX, event.clientY)) {
        return;
      }

      selectCoordinate(coordinate);
    }
  }, [canViewMap, canWriteMapMarkers, dialog, map, markers, routePlannerEnabled, selectCoordinate, showTouchMarkerDetails, updateMarkers, visualMap]);

  useEffect(() => {
    function handleNativePointerDown(event: PointerEvent) {
      if (!isPrimaryPointerButton(event.button) || quickDeedDragRef.current !== null) {
        return;
      }

      if (!(event.target instanceof Element) || event.target.closest(".map-viewport") === null) {
        return;
      }

      trackTouchPointer(event);

      if (event.pointerType === "touch") {
        if (activeTouchPointersRef.current.size >= 2) {
          event.preventDefault();
          startPinchZoomIfReady();
          return;
        }

        startLongPress(event, view);
      }

      if (startQuickDeedDrag(event)) {
        return;
      }

      if (event.shiftKey && canWriteMapMarkers) {
        return;
      }

      if (!event.ctrlKey && !routePlannerEnabled && isInteractivePanTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setContextMenu(null);
      dragRef.current = {
        hasMoved: false,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: view.x,
        startY: view.y,
        startZoom: view.zoom
      };
      setIsDragging(true);
    }

    window.addEventListener("pointerdown", handleNativePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handleNativePointerDown);
    };
  }, [canWriteMapMarkers, routePlannerEnabled, startLongPress, startPinchZoomIfReady, startQuickDeedDrag, trackTouchPointer, view]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId)) {
        activeTouchPointersRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId
        });

        const longPress = longPressRef.current;

        if (
          longPress !== null &&
          longPress.pointerId === event.pointerId &&
          Math.hypot(event.clientX - longPress.startClientX, event.clientY - longPress.startClientY) > CLICK_DRAG_THRESHOLD_PX
        ) {
          cancelLongPress(longPressRef);
        }

        const pinchZoom = pinchZoomRef.current;

        if (pinchZoom !== null && pinchZoom.pointerIds.includes(event.pointerId)) {
          const firstPointer = activeTouchPointersRef.current.get(pinchZoom.pointerIds[0]);
          const secondPointer = activeTouchPointersRef.current.get(pinchZoom.pointerIds[1]);

          if (firstPointer !== undefined && secondPointer !== undefined) {
            const distance = getPointerDistance(firstPointer, secondPointer);

            if (distance >= PINCH_MIN_DISTANCE_PX) {
              const center = getPointerCenter(firstPointer, secondPointer);
              const minZoom = getFitZoom(viewport, mapSize);
              const nextZoom = pinchZoom.startZoom * (distance / pinchZoom.startDistance);

              if (nextZoom <= minZoom) {
                setManualView(getFitView(viewport, mapSize));
              } else {
                const zoom = clamp(nextZoom, minZoom, MAX_ZOOM);

                setManualView({
                  x: center.clientX - pinchZoom.startMapX * zoom,
                  y: center.clientY - pinchZoom.startMapY * zoom,
                  zoom
                });
              }
            }
          }

          return;
        }
      }

      const drag = dragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;
      const hasMoved = drag.hasMoved || Math.hypot(deltaX, deltaY) > CLICK_DRAG_THRESHOLD_PX;
      drag.hasMoved = hasMoved;

      if (!hasMoved) {
        return;
      }

      setManualView({
        x: drag.startX + deltaX,
        y: drag.startY + deltaY,
        zoom: drag.startZoom
      });
    }

    function endDrag(event: PointerEvent) {
      if (event.pointerType === "touch") {
        activeTouchPointersRef.current.delete(event.pointerId);
        cancelLongPress(longPressRef);

        const pinchZoom = pinchZoomRef.current;

        if (pinchZoom !== null && pinchZoom.pointerIds.includes(event.pointerId)) {
          pinchZoomRef.current = null;
          dragRef.current = null;
          setIsDragging(false);
          return;
        }
      }

      finishPointerDrag(event);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [finishPointerDrag, mapSize, viewport]);

  useEffect(() => {
    function handleQuickDeedDrag(event: PointerEvent) {
      const drag = quickDeedDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId || visualMap === null) {
        return;
      }

      const deltaX = event.clientX - drag.startClientX;
      const deltaY = event.clientY - drag.startClientY;
      drag.hasMoved = drag.hasMoved || Math.hypot(deltaX, deltaY) > CLICK_DRAG_THRESHOLD_PX;
      drag.end = getClampedMapCoordinate(event.clientX, event.clientY, drag.view, visualMap);
      setQuickDeedDraft({
        end: drag.end,
        start: drag.start
      });
    }

    function endQuickDeedDrag(event: PointerEvent) {
      const drag = quickDeedDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      quickDeedDragRef.current = null;

      if (!drag.hasMoved || coordinatesAreEqual(drag.start, drag.end)) {
        setQuickDeedDraft(null);
        return;
      }

      const quickDeed = getQuickDeedDialogState(drag.start, drag.end);
      selectCoordinate(quickDeed.coordinate);
      setFormError(null);
      setDialog({
        initialDeedDimensions: quickDeed.dimensions,
        markerType: "deed",
        mode: "create",
        x: quickDeed.coordinate.x,
        y: quickDeed.coordinate.y
      });
    }

    window.addEventListener("pointermove", handleQuickDeedDrag);
    window.addEventListener("pointerup", endQuickDeedDrag);
    window.addEventListener("pointercancel", endQuickDeedDrag);

    return () => {
      window.removeEventListener("pointermove", handleQuickDeedDrag);
      window.removeEventListener("pointerup", endQuickDeedDrag);
      window.removeEventListener("pointercancel", endQuickDeedDrag);
    };
  }, [selectCoordinate, visualMap]);

  useEffect(() => {
    function handlePathPointDrag(event: PointerEvent) {
      const drag = pathPointDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId || visualMap === null) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, visualMap)) {
        return;
      }

      setPathDraft((current) => {
        if (current === null || drag.pointIndex >= current.points.length) {
          return current;
        }

        return {
          ...current,
          points: current.points.map((point, index) => (index === drag.pointIndex ? coordinate : point))
        };
      });
    }

    function endPathPointDrag(event: PointerEvent) {
      const drag = pathPointDragRef.current;

      if (drag !== null && drag.pointerId === event.pointerId) {
        pathPointDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", handlePathPointDrag);
    window.addEventListener("pointerup", endPathPointDrag);
    window.addEventListener("pointercancel", endPathPointDrag);

    return () => {
      window.removeEventListener("pointermove", handlePathPointDrag);
      window.removeEventListener("pointerup", endPathPointDrag);
      window.removeEventListener("pointercancel", endPathPointDrag);
    };
  }, [view, visualMap]);

  useEffect(() => {
    function handleMarkerRelocationDrag(event: PointerEvent) {
      const drag = markerRelocationDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId || visualMap === null) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, visualMap)) {
        return;
      }

      setDialog((current) => {
        if (
          current === null ||
          current.mode !== "edit" ||
          current.marker.id !== drag.markerId ||
          isPathMarker(current.marker)
        ) {
          return current;
        }

        return {
          ...current,
          marker: relocateMarker(current.marker, coordinate)
        };
      });
    }

    function endMarkerRelocationDrag(event: PointerEvent) {
      const drag = markerRelocationDragRef.current;

      if (drag !== null && drag.pointerId === event.pointerId) {
        markerRelocationDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", handleMarkerRelocationDrag);
    window.addEventListener("pointerup", endMarkerRelocationDrag);
    window.addEventListener("pointercancel", endMarkerRelocationDrag);

    return () => {
      window.removeEventListener("pointermove", handleMarkerRelocationDrag);
      window.removeEventListener("pointerup", endMarkerRelocationDrag);
      window.removeEventListener("pointercancel", endMarkerRelocationDrag);
    };
  }, [view, visualMap]);

  useEffect(() => {
    function handleDeedResizeDrag(event: PointerEvent) {
      const drag = deedResizeDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId || visualMap === null) {
        return;
      }

      const coordinate = getClampedMapCoordinate(event.clientX, event.clientY, drag.view, visualMap);

      setDialog((current) => {
        if (
          current === null ||
          current.mode !== "edit" ||
          current.marker.id !== drag.markerId ||
          current.marker.type !== "deed"
        ) {
          return current;
        }

        return {
          ...current,
          marker: resizeDeedMarker(current.marker, coordinate, drag, visualMap)
        };
      });
    }

    function endDeedResizeDrag(event: PointerEvent) {
      const drag = deedResizeDragRef.current;

      if (drag !== null && drag.pointerId === event.pointerId) {
        deedResizeDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", handleDeedResizeDrag);
    window.addEventListener("pointerup", endDeedResizeDrag);
    window.addEventListener("pointercancel", endDeedResizeDrag);

    return () => {
      window.removeEventListener("pointermove", handleDeedResizeDrag);
      window.removeEventListener("pointerup", endDeedResizeDrag);
      window.removeEventListener("pointercancel", endDeedResizeDrag);
    };
  }, [visualMap]);

  useEffect(() => {
    if (!canViewMap || map === null) {
      return;
    }

    if (!hasInitializedSettingsSaveRef.current) {
      hasInitializedSettingsSaveRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveUserMapSettings(map.id, userMapSettings);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canViewMap, map, userMapSettings]);

  useEffect(() => {
    if (!canViewMap || map === null || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const currentServer = url.searchParams.get("server");
    const expectedSlug = getMapSlug(map.id);

    if (currentServer !== expectedSlug) {
      url.searchParams.set("server", expectedSlug);
      window.history.replaceState(null, "", url);
    }
  }, [canViewMap, map]);

  const stageStyle = useMemo(
    () => ({
      height: `${mapSize.heightPx}px`,
      transform: `translate(${formatPixels(view.x)}, ${formatPixels(view.y)}) scale(${formatZoom(view.zoom)})`,
      width: `${mapSize.widthPx}px`
    }),
    [mapSize.heightPx, mapSize.widthPx, view.x, view.y, view.zoom]
  );
  const imageStyle = useMemo<CSSProperties>(
    () => ({
      height: formatPixels(mapSize.heightPx * view.zoom),
      left: formatPixels(view.x),
      position: "absolute",
      top: formatPixels(view.y),
      width: formatPixels(mapSize.widthPx * view.zoom)
    }),
    [mapSize.heightPx, mapSize.widthPx, view.x, view.y, view.zoom]
  );

  return (
  <MapIdContext.Provider value={map?.id}>
    <main className="map-page" aria-label="Map workspace">
      {canViewMap && map !== null && visualMap !== null ? (
        <section
          aria-label="Map image area"
          className={isDragging ? "map-viewport is-dragging" : "map-viewport"}
          onDragStart={preventNativeDrag}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
        >
          <Image
            alt="Wurm Online map"
            className="map-image"
            draggable={false}
            height={visualMap.heightPx}
            onDragStart={preventNativeDrag}
            priority
            src={visualMap.imageSrc}
            style={imageStyle}
            unoptimized
            width={visualMap.widthPx}
          />
          <TileHighlightOverlay
            imageStyle={imageStyle}
            map={visualMap}
            tileHighlight={tileHighlight}
          />
          <WildernessOverlay
            color={markerColors.wildernessOverlay}
            markers={displayedMarkersWithEditPreview}
            imageStyle={imageStyle}
            map={visualMap}
            mapSize={mapSize}
            opacity={markerOpacities.wildernessOverlay}
            visible={markerVisibility.wildernessOverlay}
          />
          <div
            className="map-stage"
            data-testid="map-stage"
            data-zoom={formatZoom(view.zoom)}
            style={stageStyle}
          >
            {markerVisibility.sectorGrid ? (
              <SectorGridOverlay
                color={markerColors.sectorGrid}
                mapSize={mapSize}
                opacity={markerOpacities.sectorGrid}
              />
            ) : null}
            {markerVisibility.missionGrid ? (
              <MissionGridOverlay color={markerColors.missionGrid} opacity={markerOpacities.missionGrid} />
            ) : null}
          </div>
          <MarkerLayer
            activeRelocatableMarkerId={dialog?.mode === "edit" && !isPathMarker(dialog.marker) ? dialog.marker.id : null}
            highlightedMarkerIds={highlightedMarkerIds}
            mapSize={mapSize}
            markerColors={markerColors}
            markerOpacities={markerOpacities}
            markers={displayedMarkersWithEditPreview}
            noteCategories={noteCategories}
            noteCategoryColors={noteCategoryColors}
            noteCategoryMarkerShapes={noteCategoryMarkerShapes}
            noteCategoryPipSizes={noteCategoryPipSizes}
            onContextMenu={handleMarkerContextMenu}
            onDeedOverlayPointerDown={handleDeedResizePointerDown}
            onHoverEnd={() => setHoveredMarker(null)}
            onHoverMove={(marker, event) => {
              const coordinate = getMapCoordinate(event.clientX, event.clientY, view);
              const markersUnderPointer = visualMap !== null && isInsideMap(coordinate, visualMap)
                ? getHoverMarkersAtCoordinate(
                    displayedMarkersWithEditPreview,
                    markerVisibility,
                    coordinate,
                    mapSize,
                    { includePathMarkers: true }
                  )
                : [];
              const hoverMarkers = getUniqueMarkers(markersUnderPointer.length === 0
                ? [marker]
                : [...markersUnderPointer, marker]
              );

              if (hoverMarkers.length === 0) {
                setHoveredMarker(null);
                return;
              }

              setHoveredMarker({
                coordinate,
                markers: hoverMarkers,
                screenX: event.clientX,
                screenY: event.clientY
              });
            }}
            onMarkerPointerDown={handleMarkerRelocationPointerDown}
            roadwayEditMode={roadwayEditMode}
            view={view}
            visibility={markerVisibility}
          />
          {pathDraft !== null ? (
            <PathDraftLayer
              draft={pathDraft}
              onPointPointerDown={handlePathPointPointerDown}
              view={view}
            />
          ) : null}
          {routePlannerPoints !== null ? (
            <RoutePlannerLayer
              points={routePlannerPoints}
              view={view}
            />
          ) : null}
          {searchLinesEnabled && searchTerm.length > 0 && renderedSelectedCoordinate !== null ? (
            <SearchLineLayer
              markers={displayedMarkersWithEditPreview}
              markerVisibility={markerVisibility}
              selectedCoordinate={renderedSelectedCoordinate}
              view={view}
            />
          ) : null}
          {quickDeedDraft !== null ? (
            <QuickDeedDraftLayer
              color={markerColors.deeds}
              draft={quickDeedDraft}
              opacity={markerOpacities.deeds}
              view={view}
            />
          ) : null}
          <DeedNameLayer
            hiddenDeedLabelId={hiddenDeedLabelId}
            markers={displayedMarkersWithEditPreview}
            view={view}
            visibility={markerVisibility}
          />
          <TowerNameLayer
            hiddenTowerLabelId={hiddenTowerLabelId}
            markers={displayedMarkersWithEditPreview}
            view={view}
            visibility={markerVisibility}
          />
          <SelectedCoordinateReticule coordinate={renderedSelectedCoordinate} view={view} />
        </section>
      ) : (
        <section className="map-locked" aria-label="Map access required">
          <div className="map-locked-message">
            <strong>{viewer === null ? "Log in to view the map" : "No readable servers"}</strong>
            <span>
              {viewer === null
                ? "Use the account menu in the upper right to sign in."
                : "Ask an admin or operator to grant read access for this server."}
            </span>
          </div>
        </section>
      )}
      {canViewMap ? (
        <SearchOverlay
          onSearchChange={setSearchQuery}
          value={searchQuery}
        >
          {map !== null ? (
            <MapSelectionControls
              layers={mapLayers}
              onLayerChange={(layerId) => {
                setSelectedMapLayerOverrideId(layerId);
                updateBrowserLayer(layerId);
              }}
              onServerChange={(serverId) => {
                if (serverId !== map.id) {
                  navigateToServer(serverId);
                }
              }}
              onFavoriteServerChange={setFavoriteServerId}
              favoriteServerId={favoriteServerId}
              selectedLayerId={selectedMapLayer?.id ?? ""}
              selectedServerId={map.id}
              selectedServerName={map.name}
              servers={availableServers}
            />
          ) : null}
        </SearchOverlay>
      ) : null}
      {contextMenu !== null ? (
        contextMenu.mode === "map" ? (
          <MapContextMenu
            canWrite={canWriteMapMarkers}
            contextMenu={contextMenu}
            onCreate={(markerType) => startCreateMarker(markerType, { x: contextMenu.mapX, y: contextMenu.mapY }, contextMenu.view)}
          />
        ) : (
          <MarkerContextMenu
            contextMenu={contextMenu}
            markerColors={markerColors}
            onCreate={(markerType) => startCreateMarker(markerType, { x: contextMenu.mapX, y: contextMenu.mapY }, contextMenu.view)}
            onDelete={(marker) => {
              setContextMenu(null);
              void deleteMarkerRequest(marker, updateMarkers, setAnnotations, setDialog, setFormError);
            }}
            onEdit={startEditMarker}
          />
        )
      ) : null}
      {pathDraft !== null && map !== null ? (
        <PathDraftPanel
          draft={pathDraft}
          error={formError}
          onCancel={() => {
            setPathDraft(null);
            setFormError(null);
          }}
          onChange={(nextDraft) => setPathDraft(nextDraft)}
          onClear={() => setPathDraft((current) => current === null ? current : { ...current, points: [] })}
          onRemovePoint={(pointIndex) => setPathDraft((current) => current === null ? current : {
            ...current,
            points: current.points.filter((_, index) => index !== pointIndex)
          })}
          onSave={() => void savePathDraft(pathDraft, map.id, updateMarkers, setPathDraft, setFormError)}
          onUndo={() => setPathDraft((current) => current === null ? current : {
            ...current,
            points: current.points.slice(0, -1)
          })}
        />
      ) : null}
      {hoveredMarker !== null ? (
        <MarkerHoverDetails hoveredMarker={hoveredMarker} markerColors={markerColors} />
      ) : null}
      {dialog !== null && map !== null ? (
        <MarkerDialog
          dialog={dialog}
          error={formError}
          map={map}
          noteCategories={noteCategories}
          onClose={() => {
            setDialog(null);
            setFormError(null);
            setQuickDeedDraft(null);
          }}
          onDisbandDeed={(marker) => void disbandDeedRequest(
            marker,
            updateMarkers,
            setNoteCategories,
            setDialog,
            setFormError
          )}
          onDeedPreviewChange={(marker) => setDialog((current) => (
            current?.mode === "edit" && current.marker.id === marker.id
              ? { ...current, marker }
              : current
          ))}
          onSubmit={(event) => void submitMarkerForm(event, dialog, map.id, updateMarkers, setAnnotations, setDialog, setFormError).then((saved) => {
            if (saved) {
              setQuickDeedDraft(null);
            }
          })}
        />
      ) : null}
      <div className="map-top-controls">
        <AccountOverlay
          isOpen={topPanel === "account"}
          onOpenChange={(isOpen) => setTopPanel(isOpen ? "account" : null)}
          servers={availableServers}
          viewer={viewer}
        />
        {canViewMap ? (
          <MapSettingsOverlay
            isOpen={topPanel === "settings"}
            markerColors={markerColors}
            markerOpacities={markerOpacities}
            markerVisibility={markerVisibility}
            noteCategories={noteCategories}
            noteCategoryColors={noteCategoryColors}
            noteCategoryMarkerShapes={noteCategoryMarkerShapes}
            noteCategoryPipSizes={noteCategoryPipSizes}
            roadwayEditMode={roadwayEditMode}
            searchLinesEnabled={searchLinesEnabled}
            tileHighlight={tileHighlight}
            viewerCanWrite={canWriteMapMarkers}
            viewerIsAdmin={viewer?.isAdmin ?? false}
            onMarkerColorsChange={setMarkerColors}
            onMarkerOpacitiesChange={setMarkerOpacities}
            onMarkerVisibilityChange={setMarkerVisibility}
            onNoteCategoryColorChange={updateNoteCategoryColor}
            onNoteCategoryMarkerShapeChange={updateNoteCategoryMarkerShape}
            onNoteCategoryPipSizeChange={updateNoteCategoryPipSize}
            onNoteCategoryCreate={createNoteCategory}
            onNoteCategoryDelete={deleteNoteCategory}
            onNoteCategoryUpdate={updateNoteCategory}
            onOpenChange={(isOpen) => setTopPanel(isOpen ? "settings" : null)}
            onResetSettings={resetUserMapSettings}
            onRoadwayEditModeChange={setRoadwayEditMode}
            onSearchLinesEnabledChange={setSearchLinesEnabled}
            onTileHighlightChange={setTileHighlight}
          />
        ) : null}
      </div>
      {canViewMap ? (
        <div className="map-bottom-left-controls" data-testid="map-bottom-left-controls">
          <MapLegendControl
            isOpen={isLegendOpen}
            markerColors={markerColors}
            onOpenChange={setIsLegendOpen}
          />
          <RoutePlannerControl
            enabled={routePlannerEnabled}
            onToggle={toggleRoutePlanner}
            onSpeedChange={setRoutePlannerSpeedKmh}
            routeDistance={routePlannerPoints === null ? null : getRouteDistanceTiles(routePlannerPoints)}
            speedKmh={routePlannerSpeedKmh}
          />
          {map !== null ? (
            <MapEventFeedControl
              feed={eventFeed}
              isOpen={isEventFeedOpen}
              isLoading={isEventFeedLoading}
              onOpenChange={handleEventFeedOpenChange}
              onSizeChange={setEventFeedPanelSize}
              serverName={map.name}
              size={eventFeedPanelSize}
            />
          ) : null}
        </div>
      ) : null}
      <div className="map-footer-text">
        <a
          className="map-support-link"
          href="https://ko-fi.com/poindexter8085"
          rel="noreferrer"
          target="_blank"
        >
          support me and hosting/development costs
        </a>
        <button className="map-tip-button" onClick={showNextFooterTip} type="button">
          Tip: {MAP_FOOTER_TIPS[footerTipIndex]}
        </button>
      </div>
    </main>
  </MapIdContext.Provider>
  );
}

function MapContextMenu({
  canWrite,
  contextMenu,
  onCreate
}: {
  canWrite: boolean;
  contextMenu: Extract<ContextMenuState, { mode: "map" }>;
  onCreate(markerType: MarkerType): void;
}) {
  return (
    <div
      aria-label="Map actions"
      className="map-context-menu"
      role="menu"
      style={getContextMenuStyle(contextMenu.screenX, contextMenu.screenY)}
    >
      <CoordinateCopyRow
        coordinate={{ x: contextMenu.mapX, y: contextMenu.mapY }}
        label={`${contextMenu.mapX}, ${contextMenu.mapY}`}
      />
      {canWrite ? (
        <AddMarkerMenu onCreate={onCreate} />
      ) : null}
    </div>
  );
}

type AddMarkerSubmenuId = "misc" | "roadways";

const ROADWAY_ADD_ITEMS: Array<{ label: string; markerType: MarkerType }> = [
  { label: "Bridge", markerType: "bridge" },
  { label: "Canal", markerType: "canal" },
  { label: "Highway", markerType: "highway" },
  { label: "Tunnel", markerType: "tunnel" }
];

const MISC_ADD_ITEMS: Array<{ label: string; markerType: MarkerType }> = [
  { label: "Rift", markerType: "rift" },
  { label: "Camp", markerType: "camp" },
  { label: "Minedoor", markerType: "minedoor" },
  { label: "Locate Soul", markerType: "locateSoul" }
];

function AddMarkerMenu({
  coordinate,
  onCreate
}: {
  coordinate?: MapCoordinate;
  onCreate(markerType: MarkerType): void;
}) {
  const [openSubmenu, setOpenSubmenu] = useState<AddMarkerSubmenuId | null>(null);
  const toggleSubmenu = (submenu: AddMarkerSubmenuId) => {
    setOpenSubmenu((current) => current === submenu ? null : submenu);
  };

  return (
    <div className="map-context-menu-section map-context-add-menu">
      {coordinate === undefined ? null : <p>Add at {coordinate.x}, {coordinate.y}</p>}
      <button onClick={() => onCreate("annotation")} role="menuitem" type="button">Annotation</button>
      <button onClick={() => onCreate("tower")} role="menuitem" type="button">Tower</button>
      <button onClick={() => onCreate("deed")} role="menuitem" type="button">Deed</button>
      <button onClick={() => onCreate("note")} role="menuitem" type="button">Note</button>
      <AddMarkerSubmenu
        id="roadways"
        isOpen={openSubmenu === "roadways"}
        items={ROADWAY_ADD_ITEMS}
        label="Roadways"
        onCreate={onCreate}
        onToggle={() => toggleSubmenu("roadways")}
      />
      <AddMarkerSubmenu
        id="misc"
        isOpen={openSubmenu === "misc"}
        items={MISC_ADD_ITEMS}
        label="Misc"
        onCreate={onCreate}
        onToggle={() => toggleSubmenu("misc")}
      />
    </div>
  );
}

function AddMarkerSubmenu({
  id,
  isOpen,
  items,
  label,
  onCreate,
  onToggle
}: {
  id: AddMarkerSubmenuId;
  isOpen: boolean;
  items: Array<{ label: string; markerType: MarkerType }>;
  label: string;
  onCreate(markerType: MarkerType): void;
  onToggle(): void;
}) {
  return (
    <div className="map-context-submenu">
      <button
        aria-controls={`map-context-submenu-${id}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="map-context-submenu-trigger"
        onClick={onToggle}
        role="menuitem"
        type="button"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="map-context-submenu-arrow">›</span>
      </button>
      {isOpen ? (
        <div
          aria-label={label}
          className="map-context-submenu-panel"
          id={`map-context-submenu-${id}`}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.markerType}
              onClick={() => onCreate(item.markerType)}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchOverlay({
  children,
  onSearchChange,
  value
}: {
  children?: ReactNode;
  onSearchChange(value: string): void;
  value: string;
}) {
  return (
    <div className="map-search">
      <label className="map-search-field">
        <span>Search map</span>
        <input
          aria-label="Search map"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          type="search"
          value={value}
        />
      </label>
      {children}
    </div>
  );
}

function MapSelectionControls({
  favoriteServerId,
  layers,
  onFavoriteServerChange,
  onLayerChange,
  onServerChange,
  selectedLayerId,
  selectedServerId,
  selectedServerName,
  servers
}: {
  favoriteServerId: string | null;
  layers: readonly WorkspaceMapLayer[];
  onFavoriteServerChange(serverId: string | null): void;
  onLayerChange(layerId: string): void;
  onServerChange(serverId: string): void;
  selectedLayerId: string;
  selectedServerId: string;
  selectedServerName: string;
  servers: readonly WorkspaceServer[];
}) {
  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? {
    id: selectedServerId,
    name: selectedServerName
  };
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const groupedServers = getGroupedServers(servers, favoriteServerId);

  function selectServer(serverId: string) {
    setIsServerMenuOpen(false);
    onServerChange(serverId);
  }

  return (
    <div className="map-selection-controls">
      <div className="map-server-dropdown">
        <button
          aria-controls="map-server-dropdown-panel"
          aria-expanded={isServerMenuOpen}
          aria-haspopup="menu"
          aria-label="Server"
          className="map-server-dropdown-trigger"
          onClick={() => setIsServerMenuOpen((current) => !current)}
          role="combobox"
          type="button"
        >
          <span aria-hidden="true" className={favoriteServerId === selectedServerId ? "map-server-current-star is-active" : "map-server-current-star"}>
            {favoriteServerId === selectedServerId ? "★" : "☆"}
          </span>
          <span className="map-server-current-name">{selectedServer.name}</span>
        </button>
        {isServerMenuOpen ? (
          <div aria-label="Server choices" className="map-server-dropdown-panel" id="map-server-dropdown-panel" role="menu">
            {groupedServers.map((group) => (
              <div aria-label={group.name} className="map-server-dropdown-group" key={group.name} role="group">
                <div className="map-server-dropdown-heading">{group.name}</div>
                {group.servers.map((server) => {
                  const isFavorite = favoriteServerId === server.id;
                  const favoriteLabel = isFavorite
                    ? `Remove favorite server ${server.name}`
                    : `Set ${server.name} as favorite server`;

                  return (
                    <div className={server.id === selectedServerId ? "map-server-option is-selected" : "map-server-option"} key={`${group.name}:${server.id}`}>
                      <button
                        aria-current={server.id === selectedServerId ? "true" : undefined}
                        className="map-server-option-name"
                        onClick={() => selectServer(server.id)}
                        role="menuitem"
                        type="button"
                      >
                        {server.name}
                      </button>
                      <button
                        aria-label={favoriteLabel}
                        aria-pressed={isFavorite}
                        className={isFavorite ? "map-server-option-favorite is-active" : "map-server-option-favorite"}
                        onClick={() => onFavoriteServerChange(isFavorite ? null : server.id)}
                        title={favoriteLabel}
                        type="button"
                      >
                        <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <label>
        <span>Map</span>
        <select
          aria-label="Map"
          onChange={(event) => onLayerChange(event.target.value)}
          value={selectedLayerId}
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function getGroupedServers(servers: readonly WorkspaceServer[], favoriteServerId: string | null): Array<{
  name: string;
  servers: WorkspaceServer[];
}> {
  const serversByCluster = new Map<string, WorkspaceServer[]>();
  const unclusteredServers: WorkspaceServer[] = [];
  const favoriteServer = favoriteServerId === null
    ? null
    : servers.find((server) => server.id === favoriteServerId) ?? null;

  for (const server of servers) {
    const cluster = SERVER_CLUSTERS.get(server.name);

    if (cluster === undefined) {
      unclusteredServers.push(server);
      continue;
    }

    const currentServers = serversByCluster.get(cluster) ?? [];
    serversByCluster.set(cluster, [...currentServers, server]);
  }

  const groups: Array<{ name: string; servers: WorkspaceServer[] }> = SERVER_CLUSTER_ORDER
    .map((cluster) => ({
      name: cluster,
      servers: sortServersByName(serversByCluster.get(cluster) ?? [])
    }))
    .filter((group) => group.servers.length > 0);

  if (favoriteServer !== null) {
    groups.unshift({
      name: "Favorite",
      servers: [favoriteServer]
    });
  }

  if (unclusteredServers.length > 0) {
    groups.push({
      name: "Other",
      servers: sortServersByName(unclusteredServers)
    });
  }

  return groups;
}

function sortServersByName(servers: readonly WorkspaceServer[]): WorkspaceServer[] {
  return Array.from(servers).sort((first, second) => first.name.localeCompare(second.name));
}

function RoutePlannerControl({
  enabled,
  onSpeedChange,
  onToggle,
  routeDistance,
  speedKmh
}: {
  enabled: boolean;
  onSpeedChange(speedKmh: number): void;
  onToggle(): void;
  routeDistance: number | null;
  speedKmh: number;
}) {
  const distanceTiles = routeDistance ?? 0;
  const distanceMeters = getRouteDistanceMeters(distanceTiles);

  return (
    <div className="map-route-planner-control">
      <button
        aria-label="Route planner"
        aria-pressed={enabled}
        className={enabled ? "map-route-planner-button is-active" : "map-route-planner-button"}
        onClick={onToggle}
        title="Route planner"
        type="button"
      >
        <span aria-hidden="true" className="map-route-planner-icon" />
      </button>
      {enabled ? (
        <div className="map-route-planner-popout">
          <label className="map-route-planner-speed">
            <span>Speed</span>
            <input
              aria-label="Speed"
              max={60}
              min={0}
              onChange={(event) => onSpeedChange(clampRoutePlannerSpeed(Number(event.target.value)))}
              step={1}
              type="number"
              value={speedKmh}
            />
            <span>km/h</span>
          </label>
          <div aria-label="Route distance" className="map-route-planner-stats">
            <span>{formatRouteDistance(distanceTiles)} tiles</span>
            <span>{formatRouteDistance(distanceMeters)} meters</span>
            <span>Time {formatRouteTravelTime(distanceMeters, speedKmh)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MapLegendControl({
  isOpen,
  markerColors,
  onOpenChange
}: {
  isOpen: boolean;
  markerColors: MarkerColors;
  onOpenChange(isOpen: boolean): void;
}) {
  const items = getLegendItems(markerColors);

  return (
    <div className="map-legend-control">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Map legend"
        className={isOpen ? "map-legend-button is-active" : "map-legend-button"}
        onClick={() => onOpenChange(!isOpen)}
        title="Map legend"
        type="button"
      >
        <span aria-hidden="true" className="map-legend-button-icon" />
      </button>
      {isOpen ? (
        <section aria-label="Map legend" className="map-legend-panel" role="dialog">
          <strong>Legend</strong>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <span
                  aria-hidden="true"
                  className={`map-legend-symbol map-legend-symbol--${item.variant}`}
                  data-testid={`legend-symbol-${item.id}`}
                  style={getLegendSymbolStyle(item.color)}
                />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MapEventFeedControl({
  feed,
  isOpen,
  isLoading,
  onOpenChange,
  onSizeChange,
  serverName,
  size
}: {
  feed: WurmMapsEventFeed | null;
  isOpen: boolean;
  isLoading: boolean;
  onOpenChange(isOpen: boolean): void;
  onSizeChange(size: EventFeedPanelSize): void;
  serverName: string;
  size: EventFeedPanelSize;
}) {
  const buttonLabel = `${serverName} events`;

  return (
    <div className="map-event-feed-control">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={buttonLabel}
        className={isOpen ? "map-event-feed-button is-active" : "map-event-feed-button"}
        onClick={() => onOpenChange(!isOpen)}
        title={buttonLabel}
        type="button"
      >
        <span aria-hidden="true" className="map-event-feed-button-icon" />
      </button>
      {isOpen ? (
        <MapEventFeedPanel
          feed={feed}
          isLoading={isLoading}
          onSizeChange={onSizeChange}
          serverName={serverName}
          size={size}
        />
      ) : null}
    </div>
  );
}

function MapEventFeedPanel({
  feed,
  isLoading,
  onSizeChange,
  serverName,
  size
}: {
  feed: WurmMapsEventFeed | null;
  isLoading: boolean;
  onSizeChange(size: EventFeedPanelSize): void;
  serverName: string;
  size: EventFeedPanelSize;
}) {
  const resizeDragRef = useRef<EventFeedResizeDragState | null>(null);
  const events = feed?.events
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id))
    .slice(0, EVENT_FEED_DISPLAY_LIMIT) ?? [];
  const handleResizeStart = useCallback((
    handle: EventFeedResizeHandleDefinition,
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!isPrimaryPointerButton(event.button)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeDragRef.current = {
      horizontalDirection: handle.horizontalDirection,
      maxHeight: getEventFeedViewportMaxHeight(),
      maxWidth: getEventFeedViewportMaxWidth(),
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHeight: size.height,
      startWidth: size.width,
      verticalDirection: handle.verticalDirection
    };
  }, [size.height, size.width]);

  useEffect(() => {
    function handleResizeDrag(event: PointerEvent) {
      const drag = resizeDragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      onSizeChange(clampEventFeedPanelSize(
        drag.startWidth + (event.clientX - drag.startClientX) * drag.horizontalDirection,
        drag.startHeight + (event.clientY - drag.startClientY) * drag.verticalDirection,
        drag.maxWidth,
        drag.maxHeight
      ));
    }

    function endResizeDrag(event: PointerEvent) {
      const drag = resizeDragRef.current;

      if (drag !== null && drag.pointerId === event.pointerId) {
        resizeDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", handleResizeDrag);
    window.addEventListener("pointerup", endResizeDrag);
    window.addEventListener("pointercancel", endResizeDrag);

    return () => {
      window.removeEventListener("pointermove", handleResizeDrag);
      window.removeEventListener("pointerup", endResizeDrag);
      window.removeEventListener("pointercancel", endResizeDrag);
    };
  }, [onSizeChange]);

  return (
    <section
      aria-label={`${serverName} event feed`}
      className="map-event-feed-panel"
      role="dialog"
      style={getEventFeedPanelStyle(size)}
    >
      <div className="map-event-feed-header">
        <strong>{serverName} Events</strong>
        <span>{isLoading ? "Loading" : feed === null ? "Unavailable" : formatServerStatus(feed.serverStatus.status)}</span>
      </div>
      {isLoading ? (
        <p className="map-event-feed-empty">Loading events</p>
      ) : events.length === 0 ? (
        <p className="map-event-feed-empty">
          {feed === null ? "Events unavailable" : "No recent events"}
        </p>
      ) : (
        <ol className="map-event-feed-list">
          {events.map((event) => (
            <MapEventFeedRow event={event} key={`${event.kind}-${event.id}`} />
          ))}
        </ol>
      )}
      {EVENT_FEED_RESIZE_HANDLES.map((handle) => (
        <div
          aria-hidden="true"
          className={`map-event-feed-resize-handle map-event-feed-resize-handle--${handle.id}`}
          data-testid={`event-feed-resize-handle-${handle.id}`}
          key={handle.id}
          onPointerDown={(event) => handleResizeStart(handle, event)}
        />
      ))}
    </section>
  );
}

function MapEventFeedRow({ event }: { event: WurmMapsEvent }) {
  return (
    <li className="map-event-feed-item">
      <div className="map-event-feed-meta">
        <span className={`map-event-feed-kind map-event-feed-kind--${event.kind}`}>{event.label}</span>
        <time dateTime={formatEventDateTime(event.timestamp)}>{formatEventTimestamp(event.timestamp)}</time>
      </div>
      <p>{event.message}</p>
    </li>
  );
}

function formatServerStatus(status: WurmMapsEventFeed["serverStatus"]["status"]): string {
  if (status === "online") {
    return "Online";
  }

  if (status === "offline") {
    return "Offline";
  }

  return "Unknown";
}

function formatEventTimestamp(timestamp: number): string {
  const dateTime = formatEventDateTime(timestamp);
  return dateTime === "" ? "Unknown" : dateTime.slice(5, 16).replace("T", " ");
}

function formatEventDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

type LegendItem = {
  color: string;
  id: string;
  label: string;
  variant: "circle" | "line" | "minedoor" | "square" | "triangle";
};

type LegendSymbolStyle = CSSProperties & {
  "--map-legend-color": string;
};

function getLegendItems(markerColors: MarkerColors): LegendItem[] {
  return [
    { color: markerColors.annotations, id: "annotation", label: "Annotation", variant: "triangle" },
    { color: markerColors.towers, id: "tower", label: "Tower", variant: "square" },
    { color: markerColors.deeds, id: "deed", label: "Deed", variant: "square" },
    { color: markerColors.notes, id: "note", label: "Note", variant: "circle" },
    { color: markerColors.rifts, id: "rift", label: "Rift", variant: "triangle" },
    { color: markerColors.camps, id: "camp", label: "Camp", variant: "triangle" },
    { color: markerColors.minedoors, id: "minedoor", label: "Minedoor", variant: "minedoor" },
    { color: markerColors.locateSouls, id: "locate-soul", label: "Locate Soul", variant: "square" },
    { color: markerColors.bridges, id: "bridge", label: "Bridge", variant: "line" },
    { color: markerColors.canals, id: "canal", label: "Canal", variant: "line" },
    { color: markerColors.highways, id: "highway", label: "Highway", variant: "line" },
    { color: markerColors.tunnels, id: "tunnel", label: "Tunnel", variant: "line" }
  ];
}

function getLegendSymbolStyle(color: string): LegendSymbolStyle {
  return {
    "--map-legend-color": color
  };
}

function SectorGridOverlay({
  color,
  mapSize,
  opacity
}: {
  color: string;
  mapSize: { heightPx: number; widthPx: number };
  opacity: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="map-sector-grid"
      data-testid="sector-grid-overlay"
      style={getSectorGridStyle(mapSize, color, opacity)}
    >
      {SECTOR_GRID_ROWS.flatMap((row) => SECTOR_GRID_COLUMNS.map((column) => (
        <span key={`${row}${column}`}>{row}{column}</span>
      )))}
    </div>
  );
}

function MissionGridOverlay({ color, opacity }: { color: string; opacity: number }) {
  return (
    <div
      aria-hidden="true"
      className="map-mission-grid"
      data-testid="mission-grid-overlay"
      style={getMissionGridStyle(color, opacity)}
    />
  );
}

function PathDraftLayer({
  draft,
  onPointPointerDown,
  view
}: {
  draft: PathDraftState;
  onPointPointerDown(pointIndex: number, event: React.PointerEvent<HTMLButtonElement>): void;
  view: ViewState;
}) {
  return (
    <div className="map-path-draft-layer" aria-label="Path draft">
      <svg aria-hidden="true" className="map-path-draft-svg">
        <polyline
          className="map-path-draft-line"
          fill="none"
          points={getPathDraftSvgPoints(draft.points, draft.width, view)}
          stroke={getDefaultPathColor(draft.type)}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth={Math.max(1, draft.width * view.zoom)}
        />
      </svg>
      {draft.points.map((point, index) => (
        <button
          aria-label={`Path point ${index + 1}`}
          className="map-path-draft-point"
          key={`${point.x}-${point.y}-${index}`}
          onPointerDown={(event) => onPointPointerDown(index, event)}
          style={getPathPointStyle(point, draft.width, view)}
          type="button"
        />
      ))}
    </div>
  );
}

function PathDraftPanel({
  draft,
  error,
  onCancel,
  onChange,
  onClear,
  onRemovePoint,
  onSave,
  onUndo
}: {
  draft: PathDraftState;
  error: string | null;
  onCancel(): void;
  onChange(draft: PathDraftState): void;
  onClear(): void;
  onRemovePoint(pointIndex: number): void;
  onSave(): void;
  onUndo(): void;
}) {
  return (
    <section className="map-path-draft-panel" role="dialog" aria-label={`Draw ${getPathTypeTitle(draft.type)}`}>
      <DialogHeader title={`Draw ${getPathTypeTitle(draft.type)}`} onClose={onCancel} />
      <div className="map-marker-form">
        <p>{draft.points.length} {draft.points.length === 1 ? "point" : "points"}</p>
        <label><span>Name</span><input aria-label="Name" onChange={(event) => onChange({ ...draft, name: event.target.value })} value={draft.name} /></label>
        <label><span>Width</span><input aria-label="Width" min={1} max={MAX_PATH_WIDTH_TILES} onChange={(event) => onChange({ ...draft, width: Number(event.target.value) })} type="number" value={draft.width} /></label>
        <label>
          <span>Notes</span>
          <textarea aria-label="Notes" onChange={(event) => onChange({ ...draft, notes: event.target.value })} value={draft.notes} />
        </label>
        {draft.points.length > 0 ? (
          <div className="map-path-point-list">
            {draft.points.map((point, index) => (
              <button
                aria-label={`Remove path point ${index + 1}`}
                key={`${point.x}-${point.y}-${index}`}
                onClick={() => onRemovePoint(index)}
                type="button"
              >
                {index + 1}: {point.x}, {point.y}
              </button>
            ))}
          </div>
        ) : null}
        {error !== null ? <p className="map-auth-error">{error}</p> : null}
        <div className="map-path-draft-actions">
          <button disabled={draft.points.length === 0} onClick={onUndo} type="button">Undo point</button>
          <button disabled={draft.points.length === 0} onClick={onClear} type="button">Clear points</button>
          <button onClick={onCancel} type="button">Cancel path</button>
          <button className="map-dialog-primary" disabled={draft.points.length < 2} onClick={onSave} type="button">Save path</button>
        </div>
      </div>
    </section>
  );
}

function DeedNameLayer({
  hiddenDeedLabelId,
  markers,
  view,
  visibility
}: {
  hiddenDeedLabelId: string | null;
  markers: WorkspaceMarker[];
  view: ViewState;
  visibility: MarkerVisibility;
}) {
  if (!visibility.deeds || !visibility.deedNames) {
    return null;
  }

  return (
    <div aria-label="Deed names" className="map-deed-name-layer">
      {markers.map((marker) => {
        if (marker.type !== "deed" || marker.id === hiddenDeedLabelId) {
          return null;
        }

        return (
          <span
            className="map-deed-name-label"
            data-testid={`deed-name-label-${marker.id}`}
            key={marker.id}
            style={getDeedNameLabelStyle(marker, view)}
          >
            {marker.name}
          </span>
        );
      })}
    </div>
  );
}

function TowerNameLayer({
  hiddenTowerLabelId,
  markers,
  view,
  visibility
}: {
  hiddenTowerLabelId: string | null;
  markers: WorkspaceMarker[];
  view: ViewState;
  visibility: MarkerVisibility;
}) {
  if (!visibility.towers || !visibility.towerNames) {
    return null;
  }

  return (
    <div aria-label="Tower names" className="map-deed-name-layer">
      {markers.map((marker) => {
        if (marker.type !== "tower" || marker.id === hiddenTowerLabelId) {
          return null;
        }

        return (
          <span
            className="map-deed-name-label map-tower-name-label"
            data-testid={`tower-name-label-${marker.id}`}
            key={marker.id}
            style={getTowerNameLabelStyle(marker, view)}
          >
            {formatTowerCreator(marker)}
          </span>
        );
      })}
    </div>
  );
}

function SelectedCoordinateReticule({
  coordinate,
  view
}: {
  coordinate: MapCoordinate | null;
  view: ViewState;
}) {
  if (coordinate === null) {
    return null;
  }

  return (
    <div
      aria-label={`Selected coordinate ${coordinate.x}, ${coordinate.y}`}
      className="map-selected-reticule"
      data-testid="selected-coordinate-reticule"
      style={getScreenCoordinateStyle(coordinate, view)}
    />
  );
}

function TileHighlightOverlay({
  imageStyle,
  map,
  tileHighlight
}: {
  imageStyle: CSSProperties;
  map: WorkspaceMap;
  tileHighlight: TileHighlightSettings;
}) {
  const [overlay, setOverlay] = useState<{ key: string; src: string } | null>(null);
  const selection = tileHighlight.selection;
  const overlayKey = isTileHighlightSelection(selection)
    ? getTileHighlightOverlayKey(map, selection, tileHighlight.color)
    : "";

  useEffect(() => {
    let isCancelled = false;

    if (!isTileHighlightSelection(selection)) {
      return () => {
        isCancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      void loadTileSourceImageData(map).then((sourceImageData) => {
        if (isCancelled) {
          return;
        }

        const mask = buildTileHighlightOutlineMask(
          sourceImageData.data,
          map.widthPx,
          map.heightPx,
          getTileHighlightTargetColors(selection),
          parseHexRgb(tileHighlight.color)
        );
        const nextOverlaySrc = renderTileHighlightDataUrl(mask, map);

        if (!isCancelled) {
          setOverlay({
            key: overlayKey,
            src: nextOverlaySrc
          });
        }
      }).catch(() => {
        if (!isCancelled) {
          setOverlay(null);
        }
      });
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [map, overlayKey, selection, tileHighlight.color]);

  if (!isTileHighlightSelection(selection) || overlay === null || overlay.key !== overlayKey) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="map-tile-highlight-overlay"
      data-testid="tile-highlight-overlay"
      style={{
        ...imageStyle,
        backgroundImage: `url("${overlay.src}")`,
        opacity: tileHighlight.opacity / 100
      }}
    />
  );
}

function WildernessOverlay({
  color,
  map,
  markers,
  imageStyle,
  mapSize,
  opacity,
  visible
}: {
  color: string;
  map: WorkspaceMap | null;
  markers: WorkspaceMarker[];
  imageStyle: CSSProperties;
  mapSize: { heightPx: number; widthPx: number };
  opacity: number;
  visible: boolean;
}) {
  const deeds = useMemo(
    () => markers.filter((marker): marker is Extract<WorkspaceMarker, { type: "deed" }> => marker.type === "deed"),
    [markers]
  );

  const waterMaskUrl = useMemo(() => {
    if (map === null) return null;
    return `/maps/${map.name.toLowerCase()}-water-mask.png`;
  }, [map]);

  const canvasKey = useMemo(() => {
    const deedKey = deeds
      .map((deed) => `${deed.id}:${deed.x}:${deed.y}:${deed.north}:${deed.south}:${deed.east}:${deed.west}:${deed.perimeter}`)
      .join(",");
    return `${mapSize.widthPx}x${mapSize.heightPx}|${color}|${deedKey}|${waterMaskUrl ?? "no-mask"}`;
  }, [color, mapSize, deeds, waterMaskUrl]);

  const [overlaySrc, setOverlaySrc] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!visible || deeds.length === 0) {
      setOverlaySrc(null);
      return () => {
        isCancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      const canvasWidth = mapSize.widthPx;
      const canvasHeight = mapSize.heightPx;
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");

      if (ctx === null) {
        if (!isCancelled) {
          setOverlaySrc(null);
        }
        return;
      }

      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.globalCompositeOperation = "destination-out";

      for (const deed of deeds) {
        const maxEW = Math.max(deed.east, deed.west) + deed.perimeter;
        const maxNS = Math.max(deed.north, deed.south) + deed.perimeter;
        const radius = Math.sqrt(maxEW * maxEW + maxNS * maxNS) + 40;
        const cx = deed.x;
        const cy = deed.y;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const finalize = () => {
        if (isCancelled) {
          return;
        }
        // Threshold alpha to binary: eliminate anti-aliased gradients
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        for (let i = 3; i < data.length; i += 4) {
          data[i] = (data[i] ?? 0) > 0 ? 255 : 0;
        }
        ctx.putImageData(imageData, 0, 0);
        setOverlaySrc(canvas.toDataURL());
      };

      if (waterMaskUrl !== null) {
        const maskImg = document.createElement("img");
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          if (isCancelled) {
            return;
          }
          // Draw mask to a temp canvas and read its pixels directly
          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = canvasWidth;
          maskCanvas.height = canvasHeight;
          const maskCtx = maskCanvas.getContext("2d");
          if (maskCtx === null) {
            finalize();
            return;
          }
          maskCtx.drawImage(maskImg, 0, 0);
          const maskData = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;

          // Get main canvas pixels and clear alpha where mask says water
          const mainData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          const pixels = mainData.data;
          for (let i = 3; i < pixels.length; i += 4) {
            if ((maskData[i] ?? 0) > 0) {
              pixels[i] = 0;
            }
          }
          ctx.putImageData(mainData, 0, 0);
          finalize();
        };
        maskImg.onerror = () => {
          if (!isCancelled) {
            finalize();
          }
        };
        maskImg.src = waterMaskUrl;
      } else {
        finalize();
      }
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canvasKey, visible, waterMaskUrl]);

  if (!visible || overlaySrc === null) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="map-wilderness-overlay"
      data-testid="wilderness-overlay"
      style={{
        ...imageStyle,
        backgroundImage: `url("${overlaySrc}")`,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        opacity: opacity / 100
      }}
    />
  );
}

function MarkerContextMenu({
  contextMenu,
  markerColors,
  onCreate,
  onDelete,
  onEdit
}: {
  contextMenu: Extract<ContextMenuState, { mode: "marker" }>;
  markerColors: MarkerColors;
  onCreate(markerType: MarkerType): void;
  onDelete(marker: WorkspaceMarker): void;
  onEdit(marker: WorkspaceMarker): void;
}) {
  return (
    <div
      aria-label="Marker actions"
      className="map-context-menu"
      role="menu"
      style={getContextMenuStyle(contextMenu.screenX, contextMenu.screenY)}
    >
      {contextMenu.markers.length > 0 ? (
        <MarkerContextRows
          coordinate={{ x: contextMenu.mapX, y: contextMenu.mapY }}
          markerColors={markerColors}
          markers={contextMenu.markers}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ) : null}
      <AddMarkerMenu
        coordinate={{ x: contextMenu.mapX, y: contextMenu.mapY }}
        onCreate={onCreate}
      />
    </div>
  );
}

function MarkerContextRows({
  coordinate,
  markerColors,
  markers,
  onDelete,
  onEdit
}: {
  coordinate: MapCoordinate;
  markerColors: MarkerColors;
  markers: WorkspaceMarker[];
  onDelete(marker: WorkspaceMarker): void;
  onEdit(marker: WorkspaceMarker): void;
}) {
  const firstMarker = markers[0] ?? null;

  if (firstMarker === null) {
    return null;
  }

  return (
    <>
      <CoordinateCopyRow
        coordinate={coordinate}
        label={`${markers.length} ${markers.length === 1 ? "item" : "items"} at ${coordinate.x}, ${coordinate.y}`}
      />
      <div className="map-context-marker-list">
        {markers.map((marker) => (
          <MarkerContextRow
            key={marker.id}
            marker={marker}
            markerColors={markerColors}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </>
  );
}

function RoutePlannerLayer({
  points,
  view
}: {
  points: MapCoordinate[];
  view: ViewState;
}) {
  return (
    <div aria-label="Route planner path" className="map-route-planner-layer" data-testid="route-planner-layer">
      <svg aria-hidden="true" className="map-route-planner-svg">
        <polyline
          className="map-route-planner-line"
          data-testid="route-planner-line"
          fill="none"
          points={getPathDraftSvgPoints(points, 1, view)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {points.map((point, index) => (
        <span
          aria-hidden="true"
          className="map-route-planner-point"
          key={`${point.x}-${point.y}-${index}`}
          style={getScreenCoordinateStyle(point, view)}
        />
      ))}
    </div>
  );
}

function SearchLineLayer({
  markers,
  markerVisibility,
  selectedCoordinate,
  view
}: {
  markers: WorkspaceMarker[];
  markerVisibility: MarkerVisibility;
  selectedCoordinate: MapCoordinate;
  view: ViewState;
}) {
  const lineMarkers = markers.filter((marker) => !isPathMarker(marker) && isMarkerVisible(marker, markerVisibility));

  if (lineMarkers.length === 0) {
    return null;
  }

  const start = getScreenCoordinateCenter(selectedCoordinate, view);

  return (
    <div aria-hidden="true" className="map-search-line-layer" data-testid="search-line-layer">
      <svg className="map-search-line-svg">
        {lineMarkers.map((marker) => {
          const end = getScreenCoordinateCenter(marker, view);

          return (
            <line
              className="map-search-line"
              data-search-line-id={marker.id}
              data-testid="search-line"
              key={marker.id}
              x1={formatSvgNumber(start.x)}
              x2={formatSvgNumber(end.x)}
              y1={formatSvgNumber(start.y)}
              y2={formatSvgNumber(end.y)}
            />
          );
        })}
      </svg>
    </div>
  );
}

function QuickDeedDraftLayer({
  color,
  draft,
  opacity,
  view
}: {
  color: string;
  draft: QuickDeedDraftState;
  opacity: number;
  view: ViewState;
}) {
  const rect = getCoordinateRect(draft.start, draft.end);

  return (
    <div
      aria-label="Quick deed draft"
      className="map-quick-deed-draft"
      data-testid="quick-deed-draft"
      style={{
        ...getScreenRectStyle(rect, view),
        backgroundColor: color,
        opacity: percentageToOpacity(opacity)
      }}
    />
  );
}

function CoordinateCopyRow({
  coordinate,
  label
}: {
  coordinate: MapCoordinate;
  label: string;
}) {
  const mapId = useContext(MapIdContext);
  const coordinateLabel = `${coordinate.x}, ${coordinate.y}`;
  const copyLink = () => copyCoordinateLink(coordinate, mapId);

  return (
    <div className="map-context-coordinate-row">
      <button
        aria-label={`Copy link to ${coordinateLabel}`}
        className="map-context-coordinate-button"
        onClick={copyLink}
        role="menuitem"
        title="Copy link"
        type="button"
      >
        <span className="map-context-coordinate-value">{label}</span>
        <span aria-hidden="true" className="map-context-coordinate-icon" />
      </button>
    </div>
  );
}

function MarkerContextRow({
  marker,
  markerColors,
  onDelete,
  onEdit
}: {
  marker: WorkspaceMarker;
  markerColors: MarkerColors;
  onDelete(marker: WorkspaceMarker): void;
  onEdit(marker: WorkspaceMarker): void;
}) {
  const label = getMarkerAtCoordinateLabel(marker);

  return (
    <div
      className="map-context-marker-row"
      data-testid={`context-marker-row-${marker.id}`}
      style={getMarkerContextRowStyle(marker, markerColors)}
    >
      <MarkerContextSummary marker={marker} />
      <div className="map-context-marker-actions">
        <button aria-label={`Edit ${label}`} onClick={() => onEdit(marker)} role="menuitem" type="button">
          Edit
        </button>
        <button aria-label={`Delete ${label}`} onClick={() => onDelete(marker)} role="menuitem" type="button">
          Delete
        </button>
      </div>
    </div>
  );
}

function MarkerContextSummary({ marker }: { marker: WorkspaceMarker }) {
  return (
    <span className="map-context-marker-copy">
      <span className="map-context-marker-title">{getMarkerContextTitle(marker)}</span>
      <span className="map-context-marker-meta">{getMarkerContextMeta(marker)}</span>
      {marker.type === "tower" ? (
        <span className="map-context-marker-meta">Tower type: {marker.towerType ?? DEFAULT_TOWER_TYPE}</span>
      ) : null}
      {marker.type === "annotation" ? null : (
        <span className="map-context-marker-modifier">Last Modified: {getMarkerLastModifiedBy(marker)}</span>
      )}
    </span>
  );
}

function MarkerDialog({
  dialog,
  error,
  map,
  noteCategories,
  onClose,
  onDeedPreviewChange,
  onDisbandDeed,
  onSubmit
}: {
  dialog: DialogState;
  error: string | null;
  map: WorkspaceMap;
  noteCategories: NoteCategory[];
  onClose(): void;
  onDeedPreviewChange(marker: Extract<WorkspaceMarker, { type: "deed" }>): void;
  onDisbandDeed(marker: Extract<WorkspaceMarker, { type: "deed" }>): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const markerType = dialog.mode === "create" ? dialog.markerType : dialog.marker.type;
  const title = dialog.mode === "create" ? `Add ${getMarkerTypeTitle(markerType)}` : `Edit ${getMarkerTitle(dialog.marker)}`;
  const coordinate = dialog.mode === "create"
    ? { x: dialog.x, y: dialog.y }
    : { x: dialog.marker.x, y: dialog.marker.y };
  const disbandableDeed = dialog.mode === "edit" && dialog.marker.type === "deed"
    ? dialog.marker
    : null;

  return (
    <section className="map-marker-dialog" role="dialog" aria-label={title}>
      <DialogHeader title={title} onClose={onClose} />
      <form className="map-marker-form" onSubmit={onSubmit}>
        <div className="map-position-fields" key={`${coordinate.x}:${coordinate.y}`}>
          <label>
            <span>X</span>
            <input name="x" required type="number" defaultValue={coordinate.x} min={0} max={map.widthPx - 1} />
          </label>
          <label>
            <span>Y</span>
            <input name="y" required type="number" defaultValue={coordinate.y} min={0} max={map.heightPx - 1} />
          </label>
        </div>
        {dialog.mode === "edit" && dialog.marker.type !== "annotation" ? (
          <div className="map-readonly-field">
            <span>Last Modified</span>
            <strong>{getMarkerLastModifiedBy(dialog.marker)}</strong>
          </div>
        ) : null}
        <MarkerFields
          dialog={dialog}
          key={dialog.mode === "edit" ? dialog.marker.id : `${markerType}:${coordinate.x}:${coordinate.y}`}
          markerType={markerType}
          noteCategories={noteCategories}
          onDeedPreviewChange={onDeedPreviewChange}
        />
        {error !== null ? <p className="map-auth-error">{error}</p> : null}
        <div className="map-dialog-actions">
          {disbandableDeed !== null ? (
            <button onClick={() => onDisbandDeed(disbandableDeed)} type="button">
              Mark Disbanded
            </button>
          ) : null}
          <button className="map-dialog-primary" type="submit">Save</button>
        </div>
      </form>
    </section>
  );
}

function MarkerHoverDetails({
  hoveredMarker,
  markerColors
}: {
  hoveredMarker: HoveredMarkerState;
  markerColors: MarkerColors;
}) {
  if (hoveredMarker.markers.length === 0) {
    return null;
  }

  const title = `Map items at ${hoveredMarker.coordinate.x}, ${hoveredMarker.coordinate.y}`;

  return (
    <section
      aria-label={title}
      className="map-hover-details"
      role="tooltip"
      style={getHoverDetailsStyle(hoveredMarker.screenX, hoveredMarker.screenY)}
    >
      <strong>{title}</strong>
      <div className="map-hover-pill-stack">
        {hoveredMarker.markers.map((marker) => (
          <HoverMarkerPill
            key={marker.id}
            marker={marker}
            markerColors={markerColors}
          />
        ))}
      </div>
    </section>
  );
}

function HoverMarkerPill({
  marker,
  markerColors
}: {
  marker: WorkspaceMarker;
  markerColors: MarkerColors;
}) {
  return (
    <div
      className="map-context-marker-row map-hover-marker-pill"
      data-testid="hover-marker-pill"
      style={getMarkerContextRowStyle(marker, markerColors)}
    >
      <MarkerContextSummary marker={marker} />
    </div>
  );
}

function DialogHeader({ onClose, title }: { onClose(): void; title: string }) {
  return (
    <div className="map-account-panel-header">
      <strong>{title}</strong>
      <button aria-label="Close marker dialog" className="map-account-close" onClick={onClose} type="button">
        x
      </button>
    </div>
  );
}

function MarkerFields({
  dialog,
  markerType,
  noteCategories,
  onDeedPreviewChange
}: {
  dialog: DialogState;
  markerType: MarkerType;
  noteCategories: NoteCategory[];
  onDeedPreviewChange?(marker: Extract<WorkspaceMarker, { type: "deed" }>): void;
}) {
  const marker = dialog.mode === "edit" ? dialog.marker : null;

  if (markerType === "tower") {
    const tower = marker?.type === "tower" ? marker : null;

    return <TowerMarkerFields isCreate={dialog.mode === "create"} tower={tower} />;
  }

  if (markerType === "annotation") {
    const annotation = marker?.type === "annotation" ? marker : null;

    return (
      <>
        <label><span>Title</span><input name="title" required defaultValue={annotation?.title ?? ""} /></label>
        <label>
          <span>Text</span>
          <textarea name="text" defaultValue={annotation?.text ?? ""} />
        </label>
      </>
    );
  }

  if (markerType === "deed") {
    const deed = marker?.type === "deed" ? marker : null;
    const initialDimensions = dialog.mode === "create" ? dialog.initialDeedDimensions : undefined;
    const deedDimensionValue = (field: keyof DeedDirectionalDimensions): number => {
      if (deed !== null) {
        return deed[field];
      }

      return initialDimensions?.[field] ?? 5;
    };
    const deedDimensionInputProps = (field: keyof DeedDirectionalDimensions) => (
      deed === null
        ? { defaultValue: deedDimensionValue(field) }
        : { value: deedDimensionValue(field) }
    );
    const handleDimensionChange = (
      field: keyof DeedDirectionalDimensions,
      value: string
    ) => {
      const nextValue = parseCoordinateParam(value);

      if (deed === null || nextValue === null) {
        return;
      }

      onDeedPreviewChange?.({
        ...deed,
        [field]: nextValue
      });
    };

    return (
      <>
        <label><span>Name</span><input name="name" required defaultValue={deed?.name ?? ""} /></label>
        <label><span>Mayor</span><input name="founder" required defaultValue={deed?.founder ?? ""} /></label>
        <label><span>Founding date</span><input name="foundingDate" type="date" defaultValue={deed?.foundingDate ?? ""} /></label>
        <div className="map-position-fields">
          <label><span>North</span><input name="north" required type="number" min={0} {...deedDimensionInputProps("north")} onChange={(event) => handleDimensionChange("north", event.currentTarget.value)} /></label>
          <label><span>West</span><input name="west" required type="number" min={0} {...deedDimensionInputProps("west")} onChange={(event) => handleDimensionChange("west", event.currentTarget.value)} /></label>
          <label><span>East</span><input name="east" required type="number" min={0} {...deedDimensionInputProps("east")} onChange={(event) => handleDimensionChange("east", event.currentTarget.value)} /></label>
          <label><span>South</span><input name="south" required type="number" min={0} {...deedDimensionInputProps("south")} onChange={(event) => handleDimensionChange("south", event.currentTarget.value)} /></label>
          <label><span>Perimeter</span><input key={`perimeter:${deed?.perimeter ?? 5}`} name="perimeter" required type="number" min={0} max={100} defaultValue={deed?.perimeter ?? 5} /></label>
        </div>
      </>
    );
  }

  if (markerType === "rift") {
    const rift = marker?.type === "rift" ? marker : null;
    return (
      <>
        <label><span>Date of arrival</span><input name="arrivalDate" type="date" defaultValue={rift?.arrivalDate ?? ""} /></label>
        <label><span>Estimated rift time</span><input name="estimatedRiftTime" type="datetime-local" defaultValue={rift?.estimatedRiftTime ?? ""} /></label>
        <label>
          <span>Notes</span>
          <textarea name="notes" defaultValue={rift?.notes ?? ""} />
        </label>
      </>
    );
  }

  if (markerType === "camp") {
    const camp = marker?.type === "camp" ? marker : null;
    return (
      <>
        <label>
          <span>Type</span>
          <select name="campType" required defaultValue={camp?.campType ?? "Rift"}>
            <option value="Rift">Rift</option>
            <option value="Goblin">Goblin</option>
          </select>
        </label>
        <label>
          <span>Notes</span>
          <textarea name="notes" defaultValue={camp?.notes ?? ""} />
        </label>
      </>
    );
  }

  if (markerType === "minedoor") {
    const minedoor = marker?.type === "minedoor" ? marker : null;
    return (
      <>
        <label><span>Strength</span><input name="strength" defaultValue={minedoor?.strength ?? ""} /></label>
        <label>
          <span>Notes</span>
          <textarea name="notes" defaultValue={minedoor?.notes ?? ""} />
        </label>
      </>
    );
  }

  if (markerType === "locateSoul") {
    const locateSoul = marker?.type === "locateSoul" ? marker : null;
    return (
      <>
        <label>
          <span>Caster Facing</span>
          <select name="casterFacing" required defaultValue={locateSoul?.casterFacing ?? "north"}>
            {LOCATE_SOUL_CASTER_FACINGS.map((facing) => (
              <option key={facing} value={facing}>{formatLocateSoulCasterFacing(facing)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Locate Soul Output</span>
          <textarea
            name="locateSoulOutput"
            required
            defaultValue={locateSoul === null ? "" : formatLocateSoulOutputForForm(locateSoul)}
          />
        </label>
        <input name="notes" type="hidden" value={locateSoul?.notes ?? ""} readOnly />
      </>
    );
  }

  if (isPathMarkerType(markerType)) {
    const path = marker !== null && isPathMarker(marker) ? marker : null;
    return (
      <>
        <label><span>Name</span><input name="name" defaultValue={path?.name ?? ""} /></label>
        <label><span>Width</span><input name="width" type="number" min={1} max={MAX_PATH_WIDTH_TILES} defaultValue={path?.width ?? 1} /></label>
        <label>
          <span>Notes</span>
          <textarea name="notes" defaultValue={path?.notes ?? ""} />
        </label>
      </>
    );
  }

  return (
    <NoteFields
      marker={marker?.type === "note" ? marker : null}
      noteCategories={noteCategories}
    />
  );
}

function TowerMarkerFields({
  isCreate,
  tower
}: {
  isCreate: boolean;
  tower: Extract<WorkspaceMarker, { type: "tower" }> | null;
}) {
  const [quickInput, setQuickInput] = useState("");
  const [towerFields, setTowerFields] = useState({
    creator: tower === null ? "" : formatTowerCreatorFormValue(tower),
    damage: tower?.damage ?? "",
    ql: tower?.ql ?? ""
  });

  function handleQuickInputChange(value: string) {
    setQuickInput(value);

    const parsed = parseTowerQuickInput(value);

    setTowerFields((current) => ({
      creator: parsed.creator ?? current.creator,
      damage: parsed.damage ?? current.damage,
      ql: parsed.ql ?? current.ql
    }));
  }

  return (
    <>
      {isCreate ? (
        <label>
          <span>Quick Input</span>
          <textarea
            name="towerQuickInput"
            value={quickInput}
            onChange={(event) => handleQuickInputChange(event.currentTarget.value)}
          />
        </label>
      ) : null}
      <label>
        <span>QL</span>
        <input
          name="ql"
          value={towerFields.ql}
          onChange={(event) => {
            const ql = event.currentTarget.value;

            setTowerFields((current) => ({ ...current, ql }));
          }}
        />
      </label>
      <label>
        <span>Damage</span>
        <input
          name="damage"
          value={towerFields.damage}
          onChange={(event) => {
            const damage = event.currentTarget.value;

            setTowerFields((current) => ({ ...current, damage }));
          }}
        />
      </label>
      <label>
        <span>Creator</span>
        <input
          name="creator"
          value={towerFields.creator}
          onChange={(event) => {
            const creator = event.currentTarget.value;

            setTowerFields((current) => ({ ...current, creator }));
          }}
        />
      </label>
      <label>
        <span>Tower type</span>
        <select name="towerType" defaultValue={tower?.towerType ?? DEFAULT_TOWER_TYPE}>
          {TOWER_TYPES.map((towerType) => (
            <option key={towerType} value={towerType}>{towerType}</option>
          ))}
        </select>
      </label>
      <label className="map-checkbox-field">
        <input name="planned" type="checkbox" defaultChecked={tower?.planned ?? false} />
        <span>Planned</span>
      </label>
    </>
  );
}

function NoteFields({
  marker,
  noteCategories
}: {
  marker: Extract<WorkspaceMarker, { type: "note" }> | null;
  noteCategories: NoteCategory[];
}) {
  const [selectedCategory, setSelectedCategory] = useState(
    marker?.category ?? noteCategories[0]?.name ?? "General"
  );

  return (
    <>
      <label><span>Title</span><input name="title" required defaultValue={marker?.title ?? ""} /></label>
      <div className="map-note-category-row">
        <label>
          <span>Category</span>
          <select
            name="category"
            onChange={(event) => setSelectedCategory(event.target.value)}
            required
            value={selectedCategory}
          >
            {noteCategories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>Text</span>
        <textarea name="text" defaultValue={marker?.text ?? ""} />
      </label>
    </>
  );
}

function formatLocateSoulOutputForForm(marker: Extract<WorkspaceMarker, { type: "locateSoul" }>): string {
  if (marker.distanceBand === "0") {
    return `You are practically standing on ${marker.targetName}!`;
  }

  return `${marker.targetName} is ${formatLocateSoulDistancePhraseForForm(marker.distanceBand)} ${formatLocateSoulDirectionPhraseForForm(marker.direction)}.`;
}

function formatLocateSoulDistancePhraseForForm(
  distanceBand: Extract<WorkspaceMarker, { type: "locateSoul" }>["distanceBand"]
): string {
  if (distanceBand === "1-3") {
    return "a stone's throw away";
  }

  if (distanceBand === "4-5") {
    return "very close";
  }

  if (distanceBand === "6-9") {
    return "pretty close by";
  }

  if (distanceBand === "10-19") {
    return "fairly close by";
  }

  if (distanceBand === "20-49") {
    return "some distance away";
  }

  if (distanceBand === "50-199") {
    return "quite some distance away";
  }

  if (distanceBand === "200-499") {
    return "rather a long distance away";
  }

  if (distanceBand === "500-999") {
    return "pretty far away";
  }

  if (distanceBand === "1000+") {
    return "far away";
  }

  return "very far away";
}

function formatLocateSoulDirectionPhraseForForm(
  direction: Extract<WorkspaceMarker, { type: "locateSoul" }>["direction"]
): string {
  if (direction === "ahead") {
    return "ahead of you";
  }

  if (direction === "aheadRight") {
    return "ahead of you to the right";
  }

  if (direction === "right") {
    return "to the right";
  }

  if (direction === "behindRight") {
    return "behind you to the right";
  }

  if (direction === "behind") {
    return "behind you";
  }

  if (direction === "behindLeft") {
    return "behind you to the left";
  }

  if (direction === "left") {
    return "to the left";
  }

  return "ahead of you to the left";
}

async function submitMarkerForm(
  event: FormEvent<HTMLFormElement>,
  dialog: DialogState,
  mapId: string,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setAnnotations: (updater: (annotations: UserAnnotation[]) => UserAnnotation[]) => void,
  setDialog: (dialog: DialogState | null) => void,
  setFormError: (error: string | null) => void
): Promise<boolean> {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const markerType = dialog.mode === "create" ? dialog.markerType : dialog.marker.type;
  const payloadResult = buildMarkerPayload(markerType, formData);

  if (!payloadResult.ok) {
    setFormError(payloadResult.error);
    return false;
  }

  if (markerType === "annotation") {
    const annotation = buildAnnotationMarker(dialog, payloadResult.payload);
    setAnnotations((current) => upsertAnnotation(current, annotation));
    setDialog(null);
    setFormError(null);
    return true;
  }

  const url = dialog.mode === "edit"
    ? `/api/markers/${dialog.marker.type}/${dialog.marker.id}`
    : `/api/maps/${mapId}/markers`;
  const response = await fetch(url, {
    body: JSON.stringify(payloadResult.payload),
    headers: { "content-type": "application/json" },
    method: dialog.mode === "edit" ? "PATCH" : "POST"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Marker could not be saved");
    return false;
  }

  const body = (await response.json()) as { marker: WorkspaceMarker };
  setMarkers((current) => upsertMarker(current, body.marker));
  setDialog(null);
  setFormError(null);
  return true;
}

async function deleteMarkerRequest(
  marker: WorkspaceMarker,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setAnnotations: (updater: (annotations: UserAnnotation[]) => UserAnnotation[]) => void,
  setDialog: (dialog: DialogState | null) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  if (marker.type === "annotation") {
    setAnnotations((current) => current.filter((candidate) => candidate.id !== marker.id));
    setDialog(null);
    setFormError(null);
    return;
  }

  const response = await fetch(`/api/markers/${marker.type}/${marker.id}`, { method: "DELETE" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Marker could not be deleted");
    return;
  }

  setMarkers((current) => current.filter((candidate) => candidate.id !== marker.id));
  setDialog(null);
  setFormError(null);
}

async function disbandDeedRequest(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setNoteCategories: (updater: (categories: NoteCategory[]) => NoteCategory[]) => void,
  setDialog: (dialog: DialogState | null) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  const response = await fetch(`/api/markers/deed/${marker.id}/disband`, { method: "POST" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Deed could not be marked disbanded");
    return;
  }

  const body = (await response.json()) as {
    category: NoteCategory;
    deletedMarkerId: string;
    marker: WorkspaceMarker;
  };

  setNoteCategories((current) => upsertNoteCategory(current, body.category));
  setMarkers((current) => upsertMarker(
    current.filter((candidate) => candidate.id !== body.deletedMarkerId),
    body.marker
  ));
  setDialog(null);
  setFormError(null);
}

async function savePathDraft(
  draft: PathDraftState,
  mapId: string,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setPathDraft: (draft: PathDraftState | null) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  if (draft.points.length < 2) {
    setFormError("Path must have at least two points");
    return;
  }

  const payload = {
    name: draft.name,
    notes: draft.notes,
    points: draft.points,
    type: draft.type,
    width: draft.width
  };
  const url = draft.mode === "edit" && draft.id !== undefined
    ? `/api/markers/${draft.type}/${draft.id}`
    : `/api/maps/${mapId}/markers`;
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: draft.mode === "edit" ? "PATCH" : "POST"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Path could not be saved");
    return;
  }

  const body = (await response.json()) as { marker: WorkspaceMarker };
  setMarkers((current) => upsertMarker(current, body.marker));
  setPathDraft(null);
  setFormError(null);
}

async function createAutoplannedTower(
  coordinate: MapCoordinate,
  mapId: string,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  const payload = {
    damage: "",
    makerName: "",
    makerNumber: "",
    planned: true,
    ql: "",
    towerType: DEFAULT_TOWER_TYPE,
    type: "tower",
    x: coordinate.x,
    y: coordinate.y
  };
  const response = await fetch(`/api/maps/${mapId}/markers`, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Planned tower could not be created");
    return;
  }

  const body = (await response.json()) as { marker: WorkspaceMarker };

  if (body.marker.type !== "tower") {
    setFormError("Planned tower could not be created");
    return;
  }

  setMarkers((current) => upsertMarker(current, body.marker));
  setFormError(null);
}

async function saveUserMapSettings(mapId: string, settings: UserMapSettings): Promise<void> {
  try {
    await fetch(`/api/maps/${mapId}/settings`, {
      body: JSON.stringify(settings),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
  } catch {
    // Preference saves are best-effort; the next successful change will send the full settings payload.
  }
}

type MarkerPayloadResult =
  | { error: string; ok: false }
  | { ok: true; payload: Record<string, unknown> };

function buildMarkerPayload(markerType: MarkerType, formData: FormData): MarkerPayloadResult {
  const base = {
    type: markerType,
    x: Number(formData.get("x")),
    y: Number(formData.get("y"))
  };

  if (markerType === "tower") {
    const creator = parseCreatorInput(String(formData.get("creator") ?? ""));

    return {
      ok: true,
      payload: {
        ...base,
        damage: String(formData.get("damage") ?? ""),
        makerName: creator.makerName,
        makerNumber: creator.makerNumber,
        planned: formData.get("planned") === "on",
        ql: String(formData.get("ql") ?? ""),
        towerType: String(formData.get("towerType") ?? DEFAULT_TOWER_TYPE)
      }
    };
  }

  if (markerType === "deed") {
    return {
      ok: true,
      payload: {
        ...base,
        east: Number(formData.get("east")),
        foundingDate: String(formData.get("foundingDate") ?? ""),
        founder: String(formData.get("founder") ?? ""),
        name: String(formData.get("name") ?? ""),
        north: Number(formData.get("north")),
        perimeter: Number(formData.get("perimeter")),
        south: Number(formData.get("south")),
        west: Number(formData.get("west"))
      }
    };
  }

  if (markerType === "rift") {
    return {
      ok: true,
      payload: {
        ...base,
        arrivalDate: String(formData.get("arrivalDate") ?? ""),
        estimatedRiftTime: String(formData.get("estimatedRiftTime") ?? ""),
        notes: String(formData.get("notes") ?? "")
      }
    };
  }

  if (markerType === "camp") {
    return {
      ok: true,
      payload: {
        ...base,
        campType: String(formData.get("campType") ?? ""),
        notes: String(formData.get("notes") ?? "")
      }
    };
  }

  if (markerType === "minedoor") {
    return {
      ok: true,
      payload: {
        ...base,
        notes: String(formData.get("notes") ?? ""),
        strength: String(formData.get("strength") ?? "")
      }
    };
  }

  if (markerType === "locateSoul") {
    const locateSoul = parseLocateSoulMessage(String(formData.get("locateSoulOutput") ?? ""));

    if (locateSoul === null) {
      return {
        error: "Paste a Locate Soul result that includes a target, distance, and direction.",
        ok: false
      };
    }

    return {
      ok: true,
      payload: {
        ...base,
        casterFacing: String(formData.get("casterFacing") ?? ""),
        direction: locateSoul.direction,
        distanceBand: locateSoul.distanceBand,
        notes: String(formData.get("notes") ?? ""),
        targetName: locateSoul.targetName
      }
    };
  }

  if (isPathMarkerType(markerType)) {
    return {
      ok: true,
      payload: {
        name: String(formData.get("name") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        points: [],
        type: markerType,
        width: 1
      }
    };
  }

  if (markerType === "annotation") {
    return {
      ok: true,
      payload: {
        ...base,
        text: String(formData.get("text") ?? ""),
        title: String(formData.get("title") ?? "")
      }
    };
  }

  return {
    ok: true,
    payload: {
      category: String(formData.get("category") ?? ""),
      ...base,
      title: String(formData.get("title") ?? ""),
      text: String(formData.get("text") ?? "")
    }
  };
}

function buildAnnotationMarker(dialog: DialogState, payload: Record<string, unknown>): UserAnnotation {
  return {
    id: dialog.mode === "edit" && dialog.marker.type === "annotation"
      ? dialog.marker.id
      : createClientMarkerId("annotation"),
    text: String(payload.text ?? ""),
    title: String(payload.title ?? ""),
    type: "annotation",
    x: Number(payload.x),
    y: Number(payload.y)
  };
}

function createClientMarkerId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function upsertAnnotation(annotations: UserAnnotation[], annotation: UserAnnotation): UserAnnotation[] {
  const existingIndex = annotations.findIndex((candidate) => candidate.id === annotation.id);

  if (existingIndex === -1) {
    return [...annotations, annotation];
  }

  return annotations.map((candidate, index) => (index === existingIndex ? annotation : candidate));
}

function upsertMarker(markers: WorkspaceMarker[], marker: WorkspaceMarker): WorkspaceMarker[] {
  const existingIndex = markers.findIndex((candidate) => candidate.id === marker.id);

  if (existingIndex === -1) {
    return [...markers, marker];
  }

  return markers.map((candidate, index) => (index === existingIndex ? marker : candidate));
}

function upsertNoteCategory(categories: NoteCategory[], category: NoteCategory): NoteCategory[] {
  const normalizedCategory = normalizeNoteCategory(category);
  const existing = categories.some((candidate) => candidate.id === normalizedCategory.id);

  if (existing) {
    return categories
      .map((candidate) => (candidate.id === normalizedCategory.id ? normalizedCategory : candidate))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return [...categories, normalizedCategory].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeNoteCategory(category: NoteCategory): NoteCategory {
  return {
    color: category.color ?? null,
    id: category.id,
    markerShape: NOTE_CATEGORY_MARKER_SHAPES.find((shape) => shape === category.markerShape) ?? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
    name: category.name,
    pipSize: Math.min(10, Math.max(1, Math.round(category.pipSize ?? DEFAULT_NOTE_CATEGORY_PIP_SIZE)))
  };
}

function parseCreatorInput(value: string): { makerName: string; makerNumber: string } {
  const trimmed = value.trim();
  const missingNumberMatch = /^(.*\S)\s+-\s+\?\?\?$/.exec(trimmed);

  if (missingNumberMatch !== null) {
    return {
      makerName: missingNumberMatch[1] ?? "",
      makerNumber: ""
    };
  }

  const match = /^(.*\S)\s+(\d{1,3})$/.exec(trimmed);

  if (match === null) {
    return {
      makerName: trimmed,
      makerNumber: ""
    };
  }

  const [, makerName = "", makerNumber = ""] = match;

  return {
    makerName,
    makerNumber
  };
}

function parseTowerQuickInput(value: string): { creator?: string; damage?: string; ql?: string } {
  const qlMatch = /\bQl:\s*(\d+(?:\.\d+)?)/i.exec(value);
  const damageMatch = /\bDam:\s*(\d+(?:\.\d+)?)/i.exec(value);
  const creatorMatch = /'([^']+)'\s+is engraved in a metal plaque/i.exec(value);

  return {
    creator: creatorMatch?.[1]?.trim(),
    damage: damageMatch?.[1] === undefined ? undefined : formatQuickInputDamage(damageMatch[1]),
    ql: qlMatch?.[1] === undefined ? undefined : formatQuickInputQuality(qlMatch[1])
  };
}

function formatQuickInputQuality(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value.trim();
  }

  return parsed.toFixed(2);
}

function formatQuickInputDamage(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value.trim();
  }

  const rounded = parsed.toFixed(2);

  if (rounded.endsWith("00")) {
    return `${Math.trunc(parsed)}.0`;
  }

  return rounded.replace(/0$/, "");
}

function formatTowerCreatorFormValue(input: { makerName: string; makerNumber: string }): string {
  if (input.makerName === "" && input.makerNumber === "") {
    return "";
  }

  return formatTowerCreator(input);
}

function getMapSize(map: WorkspaceMap | null) {
  return {
    heightPx: map?.heightPx ?? FALLBACK_MAP_SIZE_PX,
    widthPx: map?.widthPx ?? FALLBACK_MAP_SIZE_PX
  };
}

function getWorkspaceMapLayers(map: WorkspaceMap | null): WorkspaceMapLayer[] {
  if (map === null) {
    return [];
  }

  if (map.layers.length > 0) {
    return Array.from(map.layers);
  }

  return [
    {
      heightPx: map.heightPx,
      id: `${map.id}:default`,
      imageSrc: map.imageSrc,
      isDefault: true,
      name: "Terrain",
      widthPx: map.widthPx
    }
  ];
}

function getInitialSelectedLayerId(layers: readonly WorkspaceMapLayer[], selectedLayerId: string | undefined): string {
  if (selectedLayerId !== undefined && layers.some((layer) => layer.id === selectedLayerId)) {
    return selectedLayerId;
  }

  return layers.find((layer) => layer.isDefault)?.id ?? layers[0]?.id ?? "";
}

function applyMapLayer(map: WorkspaceMap, layer: WorkspaceMapLayer | null): WorkspaceMap {
  if (layer === null) {
    return map;
  }

  return {
    ...map,
    heightPx: layer.heightPx,
    imageSrc: layer.imageSrc,
    widthPx: layer.widthPx
  };
}

function getAvailableServers(servers: readonly WorkspaceServer[], map: WorkspaceMap | null): WorkspaceServer[] {
  if (servers.length > 0) {
    if (map === null || servers.some((server) => server.id === map.id || server.name === map.name)) {
      return Array.from(servers);
    }

    return [...servers, { id: map.id, name: map.name }];
  }

  return map === null ? [] : [{ id: map.id, name: map.name }];
}

type SectorGridStyle = CSSProperties & {
  "--map-sector-grid-color": string;
};

type MissionGridStyle = CSSProperties & {
  "--map-mission-grid-color": string;
};

function getSectorGridStyle(
  mapSize: { heightPx: number; widthPx: number },
  color: string,
  opacity: number
): SectorGridStyle {
  return {
    "--map-sector-grid-color": color,
    color,
    height: formatPixels(mapSize.heightPx),
    left: formatPixels(SECTOR_GRID_LEFT_OFFSET_PX),
    opacity: percentageToOpacity(opacity),
    top: formatPixels(SECTOR_GRID_TOP_OFFSET_PX),
    width: formatPixels(mapSize.widthPx)
  };
}

function getMissionGridStyle(color: string, opacity: number): MissionGridStyle {
  return {
    "--map-mission-grid-color": color,
    color,
    opacity: percentageToOpacity(opacity)
  };
}

function getTileHighlightOverlayKey(
  map: WorkspaceMap,
  selection: string,
  color: string
): string {
  return `${map.imageSrc}|${map.widthPx}x${map.heightPx}|${selection}|${color}`;
}

function loadTileSourceImageData(map: WorkspaceMap): Promise<ImageData> {
  const cacheKey = `${map.imageSrc}|${map.widthPx}x${map.heightPx}`;
  const cached = tileSourceImageDataCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const imageDataPromise = new Promise<ImageData>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = map.widthPx;
      canvas.height = map.heightPx;

      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (context === null) {
        reject(new Error("Canvas 2D context is unavailable"));
        return;
      }

      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, map.widthPx, map.heightPx);
      resolve(context.getImageData(0, 0, map.widthPx, map.heightPx));
    };
    image.onerror = () => reject(new Error(`Could not load tile source image: ${map.imageSrc}`));
    image.src = map.imageSrc;
  });

  tileSourceImageDataCache.set(cacheKey, imageDataPromise);
  return imageDataPromise;
}

function renderTileHighlightDataUrl(mask: Uint8ClampedArray, map: WorkspaceMap): string {
  const canvas = document.createElement("canvas");
  canvas.width = map.widthPx;
  canvas.height = map.heightPx;

  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const imageDataArray = new Uint8ClampedArray(mask.length);
  imageDataArray.set(mask);
  context.putImageData(new ImageData(imageDataArray, map.widthPx, map.heightPx), 0, 0);
  return canvas.toDataURL("image/png");
}

function getDeedNameLabelStyle(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  view: ViewState
): CSSProperties {
  return getScreenCoordinateStyle({ x: marker.x, y: marker.y - marker.north }, view);
}

function getTowerNameLabelStyle(
  marker: Extract<WorkspaceMarker, { type: "tower" }>,
  view: ViewState
): CSSProperties {
  return getScreenCoordinateStyle({ x: marker.x, y: marker.y - 1 }, view);
}

function getScreenCoordinateStyle(coordinate: MapCoordinate, view: ViewState): CSSProperties {
  const center = getScreenCoordinateCenter(coordinate, view);

  return {
    left: formatPixels(center.x),
    top: formatPixels(center.y)
  };
}

function getScreenCoordinateCenter(coordinate: MapCoordinate, view: ViewState): { x: number; y: number } {
  return {
    x: view.x + (coordinate.x + 0.5) * view.zoom,
    y: view.y + (coordinate.y + 0.5) * view.zoom
  };
}

function getScreenRectStyle(
  rect: { height: number; width: number; x: number; y: number },
  view: ViewState
): CSSProperties {
  return {
    height: formatPixels(rect.height * view.zoom),
    left: formatPixels(view.x + rect.x * view.zoom),
    top: formatPixels(view.y + rect.y * view.zoom),
    width: formatPixels(rect.width * view.zoom)
  };
}

function getCoordinateRect(start: MapCoordinate, end: MapCoordinate): { height: number; width: number; x: number; y: number } {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  return {
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY
  };
}

function getQuickDeedDialogState(
  start: MapCoordinate,
  end: MapCoordinate
): { coordinate: MapCoordinate; dimensions: DeedDirectionalDimensions } {
  const rect = getCoordinateRect(start, end);
  const maxX = rect.x + rect.width - 1;
  const maxY = rect.y + rect.height - 1;
  const center = {
    x: Math.floor((rect.x + maxX) / 2),
    y: Math.floor((rect.y + maxY) / 2)
  };

  return {
    coordinate: center,
    dimensions: {
      east: maxX - center.x,
      north: center.y - rect.y,
      south: maxY - center.y,
      west: center.x - rect.x
    }
  };
}

function getPathDraftSvgPoints(points: MapCoordinate[], width: number, view: ViewState): string {
  const offset = getPathCoordinateOffset(width);

  return points.map((point) => {
    const x = view.x + (point.x + offset) * view.zoom;
    const y = view.y + (point.y + offset) * view.zoom;

    return `${formatSvgNumber(x)},${formatSvgNumber(y)}`;
  }).join(" ");
}

function getPathPointStyle(point: MapCoordinate, width: number, view: ViewState): CSSProperties {
  const offset = getPathCoordinateOffset(width);

  return getScreenCoordinateStyle({
    x: point.x + offset - 0.5,
    y: point.y + offset - 0.5
  }, view);
}

function getPathCoordinateOffset(width: number): number {
  return Math.round(width) % 2 === 0 ? 1 : 0.5;
}

function getDefaultPathColor(type: PathMarkerType): string {
  if (type === "bridge") {
    return DEFAULT_USER_MAP_SETTINGS.markerColors.bridges;
  }

  if (type === "canal") {
    return DEFAULT_USER_MAP_SETTINGS.markerColors.canals;
  }

  if (type === "highway") {
    return DEFAULT_USER_MAP_SETTINGS.markerColors.highways;
  }

  return DEFAULT_USER_MAP_SETTINGS.markerColors.tunnels;
}

function getPathTypeTitle(type: PathMarkerType): string {
  if (type === "bridge") {
    return "Bridge";
  }

  if (type === "canal") {
    return "Canal";
  }

  if (type === "highway") {
    return "Highway";
  }

  return "Tunnel";
}

function appendPathDraftPoint(points: MapCoordinate[], coordinate: MapCoordinate): MapCoordinate[] {
  if (points.length >= MAX_PATH_POINTS) {
    return points;
  }

  return [...points, coordinate];
}

function appendRoutePlannerPoint(points: MapCoordinate[], coordinate: MapCoordinate): MapCoordinate[] {
  const lastPoint = points[points.length - 1];

  if (lastPoint?.x === coordinate.x && lastPoint.y === coordinate.y) {
    return points;
  }

  return [...points, coordinate];
}

function getRouteDistanceTiles(points: MapCoordinate[]): number {
  let distance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous !== undefined && current !== undefined) {
      // Wurm range math is square, so diagonal movement counts by the larger tile-axis delta.
      distance += Math.max(Math.abs(current.x - previous.x), Math.abs(current.y - previous.y));
    }
  }

  return distance;
}

function getRouteDistanceMeters(distanceTiles: number): number {
  return distanceTiles * TILE_SIZE_METERS;
}

function clampRoutePlannerSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp(Math.round(value), 0, 60);
}

function formatRouteDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(1)).toString();
}

function formatRouteTravelTime(distanceMeters: number, speedKmh: number): string {
  if (speedKmh <= 0) {
    return "--";
  }

  const seconds = Math.max(0, Math.round((distanceMeters / 1000 / speedKmh) * 3600));

  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function getEventFeedPanelStyle(size: EventFeedPanelSize): CSSProperties {
  return {
    height: formatPixels(size.height),
    width: formatPixels(size.width)
  };
}

function clampEventFeedPanelSize(
  width: number,
  height: number,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY
): EventFeedPanelSize {
  return {
    height: clamp(
      Math.round(height),
      MIN_EVENT_FEED_PANEL_SIZE.height,
      Math.max(MIN_EVENT_FEED_PANEL_SIZE.height, Math.floor(maxHeight))
    ),
    width: clamp(
      Math.round(width),
      MIN_EVENT_FEED_PANEL_SIZE.width,
      Math.max(MIN_EVENT_FEED_PANEL_SIZE.width, Math.floor(maxWidth))
    )
  };
}

function getEventFeedViewportMaxWidth(): number {
  const viewportWidth = typeof window === "undefined" ? FALLBACK_MAP_SIZE_PX : window.innerWidth;
  return Math.max(MIN_EVENT_FEED_PANEL_SIZE.width, viewportWidth - 80);
}

function getEventFeedViewportMaxHeight(): number {
  const viewportHeight = typeof window === "undefined" ? FALLBACK_MAP_SIZE_PX : window.innerHeight;
  return Math.max(MIN_EVENT_FEED_PANEL_SIZE.height, viewportHeight - 32);
}

function useViewportSize(): ViewportSize {
  const snapshot = useSyncExternalStore(
    subscribeToViewport,
    getViewportSnapshot,
    getServerViewportSnapshot
  );

  return useMemo(() => parseViewportSnapshot(snapshot), [snapshot]);
}

function useUrlSearchSnapshot(): string {
  return useSyncExternalStore(
    subscribeToUrlSearch,
    getUrlSearchSnapshot,
    getServerUrlSearchSnapshot
  );
}

function subscribeToViewport(listener: () => void): () => void {
  window.addEventListener("resize", listener);

  return () => {
    window.removeEventListener("resize", listener);
  };
}

function subscribeToUrlSearch(listener: () => void): () => void {
  window.addEventListener("popstate", listener);

  return () => {
    window.removeEventListener("popstate", listener);
  };
}

function getViewportSnapshot(): string {
  if (typeof window === "undefined") {
    return SERVER_VIEWPORT_SNAPSHOT;
  }

  return `${window.innerWidth}x${window.innerHeight}`;
}

function getUrlSearchSnapshot(): string {
  if (typeof window === "undefined") {
    return getServerUrlSearchSnapshot();
  }

  return window.location.search;
}

function getServerViewportSnapshot(): string {
  return SERVER_VIEWPORT_SNAPSHOT;
}

function getServerUrlSearchSnapshot(): string {
  return "";
}

function parseViewportSnapshot(snapshot: string): ViewportSize {
  const separatorIndex = snapshot.indexOf("x");

  if (separatorIndex === -1) {
    return { height: FALLBACK_MAP_SIZE_PX, width: FALLBACK_MAP_SIZE_PX };
  }

  const width = Number(snapshot.slice(0, separatorIndex));
  const height = Number(snapshot.slice(separatorIndex + 1));

  return {
    height: Number.isFinite(height) && height > 0 ? height : FALLBACK_MAP_SIZE_PX,
    width: Number.isFinite(width) && width > 0 ? width : FALLBACK_MAP_SIZE_PX
  };
}

function getFitView(viewport: ViewportSize, mapSize: { heightPx: number; widthPx: number }): ViewState {
  const zoom = getFitZoom(viewport, mapSize);

  return {
    ...getCenteredPosition(zoom, viewport, mapSize),
    zoom
  };
}

function getFitZoom(viewport: ViewportSize, mapSize: { heightPx: number; widthPx: number }): number {
  const widthZoom = viewport.width / mapSize.widthPx;
  const heightZoom = viewport.height / mapSize.heightPx;

  return clamp(Math.min(widthZoom, heightZoom), 0.01, MAX_ZOOM);
}

function getCoordinateView(
  coordinate: MapCoordinate,
  viewport: ViewportSize,
  mapSize: { heightPx: number; widthPx: number }
): ViewState {
  const zoom = Math.max(1, getFitZoom(viewport, mapSize));

  return {
    x: (viewport.width / 2) - ((coordinate.x + 0.5) * zoom),
    y: (viewport.height / 2) - ((coordinate.y + 0.5) * zoom),
    zoom
  };
}

function getCenteredPosition(
  zoom: number,
  viewport: ViewportSize,
  mapSize: { heightPx: number; widthPx: number }
): Pick<ViewState, "x" | "y"> {
  return {
    x: (viewport.width - mapSize.widthPx * zoom) / 2,
    y: (viewport.height - mapSize.heightPx * zoom) / 2
  };
}

function getMapCoordinate(clientX: number, clientY: number, view: ViewState) {
  return {
    x: Math.floor((clientX - view.x) / view.zoom),
    y: Math.floor((clientY - view.y) / view.zoom)
  };
}

function getAutoplannerSourceTower(dialog: DialogState | null): Extract<WorkspaceMarker, { type: "tower" }> | null {
  if (
    dialog === null ||
    dialog.mode !== "edit" ||
    dialog.marker.type !== "tower" ||
    dialog.marker.planned !== true
  ) {
    return null;
  }

  return dialog.marker;
}

function getAutoplannedTowerCoordinate(
  sourceTower: Extract<WorkspaceMarker, { type: "tower" }>,
  clickedCoordinate: MapCoordinate,
  map: WorkspaceMap
): MapCoordinate | null {
  const deltaX = clickedCoordinate.x - sourceTower.x;
  const deltaY = clickedCoordinate.y - sourceTower.y;

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  const target = Math.abs(deltaX) >= Math.abs(deltaY)
    ? {
        x: sourceTower.x + (deltaX >= 0 ? TOWER_AUTOPLANNER_SPACING_TILES : -TOWER_AUTOPLANNER_SPACING_TILES),
        y: sourceTower.y
      }
    : {
        x: sourceTower.x,
        y: sourceTower.y + (deltaY >= 0 ? TOWER_AUTOPLANNER_SPACING_TILES : -TOWER_AUTOPLANNER_SPACING_TILES)
      };

  return isInsideMap(target, map) ? target : null;
}

function hasTowerAtCoordinate(
  markers: WorkspaceMarker[],
  coordinate: MapCoordinate,
  sourceTowerId: string
): boolean {
  return markers.some((marker) => (
    marker.type === "tower" &&
    marker.id !== sourceTowerId &&
    marker.x === coordinate.x &&
    marker.y === coordinate.y
  ));
}

function getClampedMapCoordinate(clientX: number, clientY: number, view: ViewState, map: WorkspaceMap): MapCoordinate {
  const coordinate = getMapCoordinate(clientX, clientY, view);

  return {
    x: clamp(coordinate.x, 0, map.widthPx - 1),
    y: clamp(coordinate.y, 0, map.heightPx - 1)
  };
}

function coordinatesAreEqual(first: MapCoordinate, second: MapCoordinate): boolean {
  return first.x === second.x && first.y === second.y;
}

function getUrlCoordinate(map: WorkspaceMap | null, search: string): MapCoordinate | null {
  if (map === null) {
    return null;
  }

  const params = new URLSearchParams(search);
  const x = parseCoordinateParam(params.get("x"));
  const y = parseCoordinateParam(params.get("y"));

  if (x === null || y === null) {
    return null;
  }

  const coordinate = { x, y };

  return isInsideMap(coordinate, map) ? coordinate : null;
}

function parseCoordinateParam(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isInsideMap(coordinate: MapCoordinate, map: WorkspaceMap): boolean {
  return (
    coordinate.x >= 0 &&
    coordinate.y >= 0 &&
    coordinate.x < map.widthPx &&
    coordinate.y < map.heightPx
  );
}

function getHoverMarkersAtCoordinate(
  markers: WorkspaceMarker[],
  visibility: MarkerVisibility,
  coordinate: MapCoordinate,
  mapSize: { heightPx: number; widthPx: number },
  options: { includePathMarkers: boolean }
): WorkspaceMarker[] {
  const eligibleMarkers = markers.filter((marker) => (
    isMarkerVisible(marker, visibility) &&
    (options.includePathMarkers || !isPathMarker(marker))
  ));
  const directMarkers = eligibleMarkers.filter((marker) => isDirectMarkerHit(marker, coordinate));
  const directMarkerIds = new Set(directMarkers.map((marker) => marker.id));
  const areaMarkers = eligibleMarkers.filter((marker) => (
    !directMarkerIds.has(marker.id) &&
    isMarkerAreaHit(marker, coordinate, visibility, mapSize)
  ));

  return getUniqueMarkers([...directMarkers, ...areaMarkers]);
}

function isDirectMarkerHit(marker: WorkspaceMarker, coordinate: MapCoordinate): boolean {
  if (isPathMarker(marker)) {
    return false;
  }

  if (marker.type === "minedoor") {
    return marker.x === coordinate.x && marker.y === coordinate.y;
  }

  return Math.abs(marker.x - coordinate.x) <= 1 && Math.abs(marker.y - coordinate.y) <= 1;
}

function isMarkerAreaHit(
  marker: WorkspaceMarker,
  coordinate: MapCoordinate,
  visibility: MarkerVisibility,
  mapSize: { heightPx: number; widthPx: number }
): boolean {
  if (isPathMarker(marker)) {
    return isPathCoordinateHit(marker, coordinate);
  }

  if (!visibility.overlays) {
    return false;
  }

  if (marker.type === "tower") {
    return isWithinSquare(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, coordinate);
  }

  if (marker.type === "deed") {
    return isWithinDeedArea(marker, coordinate) ||
      (visibility.deedPerimeters && isWithinDeedPerimeter(marker, coordinate));
  }

  if (marker.type === "rift") {
    return visibility.riftOverlays && isWithinSquare(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, coordinate);
  }

  if (marker.type === "locateSoul") {
    return isWithinLocateSoulOverlay(marker, coordinate, mapSize);
  }

  return false;
}

function isWithinSquare(centerX: number, centerY: number, radiusTiles: number, coordinate: MapCoordinate): boolean {
  return (
    coordinate.x >= centerX - radiusTiles &&
    coordinate.x <= centerX + radiusTiles &&
    coordinate.y >= centerY - radiusTiles &&
    coordinate.y <= centerY + radiusTiles
  );
}

function isWithinDeedArea(marker: Extract<WorkspaceMarker, { type: "deed" }>, coordinate: MapCoordinate): boolean {
  return (
    coordinate.x >= marker.x - marker.west &&
    coordinate.x <= marker.x + marker.east &&
    coordinate.y >= marker.y - marker.north &&
    coordinate.y <= marker.y + marker.south
  );
}

function isWithinDeedPerimeter(marker: Extract<WorkspaceMarker, { type: "deed" }>, coordinate: MapCoordinate): boolean {
  const left = marker.x - marker.west - marker.perimeter;
  const right = marker.x + marker.east + marker.perimeter;
  const top = marker.y - marker.north - marker.perimeter;
  const bottom = marker.y + marker.south + marker.perimeter;

  return (
    coordinate.x >= left &&
    coordinate.x <= right &&
    coordinate.y >= top &&
    coordinate.y <= bottom &&
    (coordinate.x === left || coordinate.x === right || coordinate.y === top || coordinate.y === bottom)
  );
}

function isWithinLocateSoulOverlay(
  marker: Extract<WorkspaceMarker, { type: "locateSoul" }>,
  coordinate: MapCoordinate,
  mapSize: { heightPx: number; widthPx: number }
): boolean {
  const geometry = getLocateSoulOverlayGeometry({
    casterFacing: marker.casterFacing,
    direction: marker.direction,
    distanceBand: marker.distanceBand,
    mapHeightPx: mapSize.heightPx,
    mapWidthPx: mapSize.widthPx
  });
  const markerCenter = { x: marker.x + 0.5, y: marker.y + 0.5 };
  const coordinateCenter = { x: coordinate.x + 0.5, y: coordinate.y + 0.5 };
  const deltaX = coordinateCenter.x - markerCenter.x;
  const deltaY = coordinateCenter.y - markerCenter.y;
  const distanceTiles = Math.hypot(deltaX, deltaY);

  if (distanceTiles < geometry.minDistanceTiles || distanceTiles > geometry.maxDistanceTiles) {
    return false;
  }

  const angleDegrees = normalizeDegrees(Math.atan2(deltaX, -deltaY) * (180 / Math.PI));
  const angleDifference = getSmallestAngleDifference(angleDegrees, geometry.centerAngleDegrees);

  return angleDifference <= geometry.spanDegrees / 2;
}

function isPathCoordinateHit(marker: Extract<WorkspaceMarker, { type: PathMarkerType }>, coordinate: MapCoordinate): boolean {
  if (marker.points.length < 2) {
    return false;
  }

  const target = { x: coordinate.x + 0.5, y: coordinate.y + 0.5 };
  const pathOffset = getPathCoordinateOffset(marker.width);
  const threshold = Math.max(0.5, marker.width / 2);

  for (let index = 1; index < marker.points.length; index += 1) {
    const startPoint = marker.points[index - 1];
    const endPoint = marker.points[index];

    if (
      startPoint !== undefined &&
      endPoint !== undefined &&
      getDistanceToSegment(target, {
        x: startPoint.x + pathOffset,
        y: startPoint.y + pathOffset
      }, {
        x: endPoint.x + pathOffset,
        y: endPoint.y + pathOffset
      }) <= threshold
    ) {
      return true;
    }
  }

  return false;
}

function getDistanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const segmentProgress = clamp(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / segmentLengthSquared,
    0,
    1
  );
  const closestPoint = {
    x: start.x + segmentProgress * deltaX,
    y: start.y + segmentProgress * deltaY
  };

  return Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function getSmallestAngleDifference(firstAngle: number, secondAngle: number): number {
  return Math.abs(((firstAngle - secondAngle + 540) % 360) - 180);
}

function isOverlayContextTarget(target: Element): boolean {
  return target.classList.contains("map-deed-overlay");
}

function getUniqueMarkers(markers: WorkspaceMarker[]): WorkspaceMarker[] {
  const seenIds = new Set<string>();

  return markers.filter((marker) => {
    if (seenIds.has(marker.id)) {
      return false;
    }

    seenIds.add(marker.id);
    return true;
  });
}

function relocateMarker<TMarker extends WorkspaceMarker>(marker: TMarker, coordinate: MapCoordinate): TMarker {
  return {
    ...marker,
    x: coordinate.x,
    y: coordinate.y
  };
}

function resizeDeedMarker(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  coordinate: MapCoordinate,
  drag: Pick<DeedResizeDragState, "horizontalSide" | "verticalSide">,
  map: WorkspaceMap
): Extract<WorkspaceMarker, { type: "deed" }> {
  const maxWest = Math.max(0, marker.x - marker.perimeter);
  const maxEast = Math.max(0, map.widthPx - 1 - marker.x - marker.perimeter);
  const maxNorth = Math.max(0, marker.y - marker.perimeter);
  const maxSouth = Math.max(0, map.heightPx - 1 - marker.y - marker.perimeter);

  return {
    ...marker,
    east: drag.horizontalSide === "east"
      ? clamp(coordinate.x - marker.x, 0, maxEast)
      : marker.east,
    north: drag.verticalSide === "north"
      ? clamp(marker.y - coordinate.y, 0, maxNorth)
      : marker.north,
    south: drag.verticalSide === "south"
      ? clamp(coordinate.y - marker.y, 0, maxSouth)
      : marker.south,
    west: drag.horizontalSide === "west"
      ? clamp(marker.x - coordinate.x, 0, maxWest)
      : marker.west
  };
}

function isMarkerVisible(marker: WorkspaceMarker, visibility: MarkerVisibility): boolean {
  if (isPathMarker(marker)) {
    if (marker.type === "bridge") {
      return visibility.bridges;
    }

    if (marker.type === "canal") {
      return visibility.canals;
    }

    if (marker.type === "highway") {
      return visibility.highways;
    }

    return visibility.tunnels;
  }

  if (marker.type === "tower") {
    return visibility.towers && (marker.planned !== true || visibility.plannedTowers);
  }

  if (marker.type === "annotation") {
    return visibility.annotations;
  }

  if (marker.type === "deed") {
    return visibility.deeds;
  }

  if (marker.type === "rift") {
    return true;
  }

  if (marker.type === "camp") {
    return visibility.camps;
  }

  if (marker.type === "minedoor") {
    return visibility.minedoors;
  }

  if (marker.type === "locateSoul") {
    return visibility.locateSouls;
  }

  return visibility.notes;
}

function isPathMarker(marker: WorkspaceMarker): marker is Extract<WorkspaceMarker, { type: PathMarkerType }> {
  return isPathMarkerType(marker.type);
}

function isPathMarkerType(markerType: MarkerType): markerType is PathMarkerType {
  return markerType === "bridge" || markerType === "canal" || markerType === "highway" || markerType === "tunnel";
}

function markerMatchesSearch(marker: WorkspaceMarker, searchTerm: string): boolean {
  if (isPathMarker(marker)) {
    return false;
  }

  return getMarkerSearchText(marker).toLowerCase().includes(searchTerm);
}

function getMarkerSearchText(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return [
      "annotation",
      marker.title,
      marker.text,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "tower") {
    return [
      "tower",
      formatTowerCreator(marker),
      marker.ql,
      marker.damage,
      marker.planned ? "planned" : "",
      marker.towerType ?? DEFAULT_TOWER_TYPE,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "deed") {
    return [
      "deed",
      marker.name,
      marker.founder,
      formatDeedDimensions(marker),
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "rift") {
    return [
      "rift",
      "rifts",
      marker.arrivalDate ?? "",
      marker.estimatedRiftTime ?? "",
      marker.notes,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "camp") {
    return [
      "camp",
      "camps",
      marker.campType,
      marker.notes,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "minedoor") {
    return [
      "minedoor",
      "minedoors",
      "mine door",
      "mine doors",
      marker.strength,
      marker.notes,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (marker.type === "locateSoul") {
    return [
      "locate soul",
      marker.targetName,
      "locate souls",
      formatLocateSoulCasterFacing(marker.casterFacing),
      formatLocateSoulDirection(marker.direction),
      formatLocateSoulDistanceBand(marker.distanceBand),
      marker.notes,
      marker.x,
      marker.y
    ].join(" ");
  }

  if (isPathMarker(marker)) {
    return "";
  }

  return [
    "note",
    marker.category,
    marker.title,
    marker.text,
    marker.x,
    marker.y
  ].join(" ");
}

function updateBrowserCoordinate(coordinate: MapCoordinate): void {
  window.history.replaceState(null, "", getCoordinateUrl(coordinate));
}

function updateBrowserLayer(layerId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("layer", layerId);
  window.history.replaceState(null, "", url);
}

function navigateToServer(serverId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("server", getMapSlug(serverId));
  url.searchParams.delete("layer");
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

function getMapSlug(mapId: string): string {
  return mapId.startsWith("map-") ? mapId.slice(4) : mapId;
}

function getCoordinateUrl(coordinate: MapCoordinate, serverId?: string): URL {
  const url = new URL(window.location.href);
  url.searchParams.set("x", String(coordinate.x));
  url.searchParams.set("y", String(coordinate.y));
  if (serverId !== undefined) {
    url.searchParams.set("server", getMapSlug(serverId));
  }
  return url;
}

function copyCoordinateLink(coordinate: MapCoordinate, serverId?: string): void {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return;
  }

  void navigator.clipboard.writeText(getCoordinateUrl(coordinate, serverId).toString());
}

function preventNativeDrag(event: React.DragEvent<HTMLElement>): void {
  event.preventDefault();
}

function cancelLongPress(ref: { current: LongPressState | null }): void {
  if (ref.current === null) {
    return;
  }

  window.clearTimeout(ref.current.timeoutId);
  ref.current = null;
}

function isPrimaryPointerButton(button: number | undefined): boolean {
  return button === undefined || button === 0;
}

function getPointerDistance(first: TouchPointerState, second: TouchPointerState): number {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function getPointerCenter(
  first: TouchPointerState,
  second: TouchPointerState
): { clientX: number; clientY: number } {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2
  };
}

function isInteractivePanTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(".map-deed-overlay, .map-marker, .map-deed-center--interactive") !== null) {
    return false;
  }

  return target.closest("button, a, input, select, textarea, [role='menu'], [role='dialog']") !== null;
}

function getMarkerTitle(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return `Annotation ${marker.title}`;
  }

  if (marker.type === "tower") {
    return "Tower";
  }

  if (marker.type === "deed") {
    return "Deed";
  }

  if (marker.type === "rift") {
    return "Rift";
  }

  if (marker.type === "camp") {
    return "Camp";
  }

  if (marker.type === "minedoor") {
    return "Minedoor";
  }

  if (marker.type === "locateSoul") {
    return "Locate Soul";
  }

  if (isPathMarker(marker)) {
    return getPathTypeTitle(marker.type);
  }

  return `Note ${marker.category} - ${marker.title}`;
}

function getMarkerLastModifiedBy(marker: WorkspaceMarker): string {
  return "lastModifiedBy" in marker ? marker.lastModifiedBy ?? "Unknown" : "Unknown";
}

function getMarkerLabel(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return `Annotation ${marker.title}`;
  }

  if (marker.type === "tower") {
    return `Tower ${formatTowerCreator(marker)}`;
  }

  if (marker.type === "deed") {
    return `Deed ${marker.name}`;
  }

  if (marker.type === "rift") {
    return "Rift";
  }

  if (marker.type === "camp") {
    return `Camp ${marker.campType}`;
  }

  if (marker.type === "minedoor") {
    return "Minedoor";
  }

  if (marker.type === "locateSoul") {
    return `Locate Soul ${marker.targetName}`;
  }

  if (isPathMarker(marker)) {
    return `${getPathTypeTitle(marker.type)} ${marker.name || "path"}`;
  }

  return "Note";
}

function getMarkerAtCoordinateLabel(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return `Annotation ${marker.title}`;
  }

  if (marker.type === "note") {
    return `Note ${marker.category} - ${marker.title}`;
  }

  return getMarkerLabel(marker);
}

function getMarkerContextTitle(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return marker.title;
  }

  if (marker.type === "tower") {
    return formatTowerCreator(marker);
  }

  if (marker.type === "deed") {
    return marker.name;
  }

  if (marker.type === "rift") {
    return "Rift";
  }

  if (marker.type === "camp") {
    return `${marker.campType} camp`;
  }

  if (marker.type === "minedoor") {
    return "Minedoor";
  }

  if (marker.type === "locateSoul") {
    return `Locate Soul ${marker.targetName}`;
  }

  if (isPathMarker(marker)) {
    return marker.name || getPathTypeTitle(marker.type);
  }

  return marker.title;
}

function getMarkerContextMeta(marker: WorkspaceMarker): string {
  if (marker.type === "annotation") {
    return "Annotation";
  }

  if (marker.type === "tower") {
    return getTowerContextMeta(marker);
  }

  if (marker.type === "deed") {
    return `Deed | Mayor ${marker.founder} | ${formatDeedDimensions(marker)}`;
  }

  if (marker.type === "rift") {
    return marker.estimatedRiftTime === null ? "Rift" : `Rift | ${marker.estimatedRiftTime}`;
  }

  if (marker.type === "camp") {
    return `Camp | ${marker.campType}`;
  }

  if (marker.type === "minedoor") {
    return marker.strength.length === 0 ? "Minedoor" : `Minedoor | Strength ${marker.strength}`;
  }

  if (marker.type === "locateSoul") {
    return `Locate Soul | ${formatLocateSoulDirection(marker.direction)} | ${formatLocateSoulDistanceBand(marker.distanceBand)}`;
  }

  if (isPathMarker(marker)) {
    return `${getPathTypeTitle(marker.type)} | ${marker.points.length} points | Width ${marker.width}`;
  }

  return `Note | ${marker.category}`;
}

type MarkerContextRowStyle = CSSProperties & {
  "--map-context-marker-color": string;
};

function getMarkerContextRowStyle(marker: WorkspaceMarker, markerColors: MarkerColors): MarkerContextRowStyle {
  return {
    "--map-context-marker-color": getMarkerContextColor(marker, markerColors)
  };
}

function getMarkerContextColor(marker: WorkspaceMarker, markerColors: MarkerColors): string {
  if (marker.type === "annotation") {
    return markerColors.annotations;
  }

  if (marker.type === "tower") {
    return markerColors.towers;
  }

  if (marker.type === "deed") {
    return markerColors.deeds;
  }

  if (marker.type === "rift") {
    return markerColors.rifts;
  }

  if (marker.type === "camp") {
    return markerColors.camps;
  }

  if (marker.type === "minedoor") {
    return markerColors.minedoors;
  }

  if (marker.type === "locateSoul") {
    return markerColors.locateSouls;
  }

  if (marker.type === "bridge") {
    return markerColors.bridges;
  }

  if (marker.type === "canal") {
    return markerColors.canals;
  }

  if (marker.type === "highway") {
    return markerColors.highways;
  }

  if (marker.type === "tunnel") {
    return markerColors.tunnels;
  }

  return markerColors.notes;
}

function formatDeedDimensions(marker: Extract<WorkspaceMarker, { type: "deed" }>): string {
  return `${marker.west + marker.east + 1}x${marker.north + marker.south + 1}`;
}

function getMarkerTypeTitle(markerType: MarkerType): string {
  if (markerType === "annotation") {
    return "annotation";
  }

  if (markerType === "tower") {
    return "tower";
  }

  if (markerType === "deed") {
    return "deed";
  }

  if (markerType === "rift") {
    return "rift";
  }

  if (markerType === "camp") {
    return "camp";
  }

  if (markerType === "minedoor") {
    return "minedoor";
  }

  if (markerType === "locateSoul") {
    return "locate soul";
  }

  if (markerType === "bridge") {
    return "bridge";
  }

  if (markerType === "canal") {
    return "canal";
  }

  if (markerType === "highway") {
    return "highway";
  }

  if (markerType === "tunnel") {
    return "tunnel";
  }

  return "note";
}

function getHoverDetailsStyle(screenX: number, screenY: number): CSSProperties {
  return getBoundedFixedPosition(
    screenX + HOVER_DETAILS_OFFSET_PX,
    screenY + HOVER_DETAILS_OFFSET_PX,
    HOVER_DETAILS_MAX_WIDTH_PX,
    HOVER_DETAILS_MAX_HEIGHT_PX
  );
}

function getTowerContextMeta(marker: Extract<WorkspaceMarker, { type: "tower" }>): string {
  const parts = ["Tower"];

  if (marker.planned) {
    parts.push("Planned");
  }

  if (marker.ql.trim() !== "") {
    parts.push(`QL ${marker.ql}`);
  }

  if (marker.damage.trim() !== "") {
    parts.push(`DMG ${marker.damage}`);
  }

  return parts.join(" | ");
}

function getContextMenuStyle(screenX: number, screenY: number): CSSProperties {
  return getBoundedFixedPosition(
    screenX,
    screenY,
    CONTEXT_MENU_MAX_WIDTH_PX,
    CONTEXT_MENU_MAX_HEIGHT_PX
  );
}

function getBoundedFixedPosition(
  screenX: number,
  screenY: number,
  maxWidth: number,
  maxHeight: number
): CSSProperties {
  const viewportWidth = typeof window === "undefined" ? FALLBACK_MAP_SIZE_PX : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? FALLBACK_MAP_SIZE_PX : window.innerHeight;
  const boundedMaxHeight = Math.min(maxHeight, Math.max(0, viewportHeight - FLOATING_MENU_MARGIN_PX * 2));

  return {
    left: formatPixels(clamp(
      screenX,
      FLOATING_MENU_MARGIN_PX,
      Math.max(FLOATING_MENU_MARGIN_PX, viewportWidth - maxWidth - FLOATING_MENU_MARGIN_PX)
    )),
    maxHeight: formatPixels(boundedMaxHeight),
    overflowY: "auto",
    top: formatPixels(clamp(
      screenY,
      FLOATING_MENU_MARGIN_PX,
      Math.max(FLOATING_MENU_MARGIN_PX, viewportHeight - boundedMaxHeight - FLOATING_MENU_MARGIN_PX)
    ))
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function percentageToOpacity(value: number): number {
  return clamp(value, 0, 100) / 100;
}

function formatZoom(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function formatPixels(value: number): string {
  return `${Number(value.toFixed(2))}px`;
}
