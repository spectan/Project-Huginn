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
  parseUserMapSettings,
  type EventFeedPanelSize,
  type NoteCategoryColors,
  type NoteCategoryMarkerShapes,
  type NoteCategoryPipSizes,
  type TileHighlightPanelPosition,
  type UserAnnotation,
  type UserMapSettings
} from "@/lib/map-settings/map-settings";
import type { WurmMapsEvent, WurmMapsEventFeed } from "@/lib/wurmmaps/event-feed";
import {
  isPathMarkerType,
  type MarkerColors,
  type MarkerOpacities,
  type MarkerType,
  type MarkerVisibility,
  type NoteCategory,
  type TileHighlightSettings,
  type WorkspaceMap,
  type WorkspaceMapLayer,
  type WorkspaceMarker,
  type WorkspaceServer
} from "@/lib/markers/marker-types";
import { AccountOverlay, type AccountViewer } from "./account-overlay";
import { MapSettingsOverlay, type NoteCategoryMutationResult } from "./map-settings-overlay";
import { DialogHeader } from "./dialog-header";
import {
  formatPixels,
  formatSvgNumber,
  getPathCoordinateOffset,
  getPathSvgPoints,
  getScreenRectStyle,
  isPathMarker,
  jsonRequest,
  percentageToOpacity,
  type PathMarkerType
} from "./map-helpers";
import { MarkerLayer } from "./marker-layer";
import { readResponseError, requestJson } from "@/lib/client/request-json";

const FALLBACK_MAP_SIZE_PX = 2048;
const MAX_ZOOM = 64;
const CLICK_DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_DURATION_MS = 600;
const WILDERNESS_REBUILD_DEBOUNCE_MS = 180;
const UNIQUE_ALERT_REFRESH_INTERVAL_MS = 60 * 1000;
// Keepalive requests share a 64KB body quota; leave headroom for other in-flight keepalive requests.
const MAX_KEEPALIVE_BODY_BYTES = 60 * 1024;
const SERVER_SWITCH_SETTINGS_FLUSH_TIMEOUT_MS = 1000;
const SETTINGS_SAVE_ERROR_MESSAGE = "Map settings could not be saved";
// Mirror the server's user-settings caps (src/lib/map-settings/map-settings.ts).
const MAX_ANNOTATIONS = 500;
const MAX_ANNOTATION_TITLE_LENGTH = 120;
const MAX_ANNOTATION_TEXT_LENGTH = 2000;
const PINCH_MIN_DISTANCE_PX = 8;
const ZOOM_STEP = 1.2;
const WHEEL_NOTCH_PX = 100;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_HEIGHT_PX = 40;
const WHEEL_PAGE_HEIGHT_PX = 800;
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
const SHARE_LINK_MIN_HOURS = 1;
const SHARE_LINK_MAX_HOURS = 24;
const SHARE_LINK_DEFAULT_HOURS = 24;
const UNIQUE_RESPAWN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const UNIQUE_ALERT_DISMISSED_STORAGE_KEY = "huginn:unique-alert-dismissed";
const LAST_MAP_STORAGE_KEY = "huginn:last-map";
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
const MARKER_TYPE_LABELS: Record<MarkerType, string> = {
  annotation: "Annotation",
  bridge: "Bridge",
  camp: "Camp",
  canal: "Canal",
  deed: "Deed",
  highway: "Highway",
  locateSoul: "Locate Soul",
  minedoor: "Minedoor",
  note: "Note",
  rift: "Rift",
  tower: "Tower",
  tunnel: "Tunnel"
};

// Settings keys are the plural marker type ("locateSoul" -> "locateSouls").
function getMarkerTypeKey<T extends MarkerType>(type: T): `${T}s` {
  return `${type}s`;
}

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

type PendingSettingsSave = {
  mapId: string;
  settings: UserMapSettings;
  timeoutId: number;
};

type MapWorkspaceProps = {
  initialMarkers: WorkspaceMarker[];
  initialNoteCategories?: readonly NoteCategory[];
  initialSettings?: UserMapSettings;
  lastUniqueSlainAt?: string | null;
  map: WorkspaceMap | null;
  selectedLayerId?: string;
  servers?: readonly WorkspaceServer[];
  shareToken?: string;
  viewer: AccountViewer | null;
};

export default function MapWorkspace({
  initialMarkers,
  initialNoteCategories = DEFAULT_NOTE_CATEGORIES,
  initialSettings = DEFAULT_USER_MAP_SETTINGS,
  lastUniqueSlainAt = null,
  map,
  selectedLayerId,
  servers = [],
  shareToken,
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
  const mapWidthPx = visualMap?.widthPx;
  const mapHeightPx = visualMap?.heightPx;
  // Keep a stable object so memoized children (MarkerLayer) and callbacks don't churn every render.
  const mapSize = useMemo(
    () => getMapSize(
      mapWidthPx === undefined || mapHeightPx === undefined ? null : { heightPx: mapHeightPx, widthPx: mapWidthPx }
    ),
    [mapHeightPx, mapWidthPx]
  );
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
  const isHoveringDetailsRef = useRef(false);
  const hoverCloseTimeoutRef = useRef<number | null>(null);

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
  const [isCountersOpen, setIsCountersOpen] = useState(false);
  const [isEventFeedOpen, setIsEventFeedOpen] = useState(false);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();

    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      hoverCloseTimeoutRef.current = null;

      if (!isHoveringDetailsRef.current) {
        setHoveredMarker(null);
      }
    }, 150);
  }, [cancelHoverClose]);

  const [eventFeedState, setEventFeedState] = useState<{
    feed: WurmMapsEventFeed | null;
    mapId: string | null;
  }>({
    feed: null,
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
  const pendingSettingsSaveRef = useRef<PendingSettingsSave | null>(null);
  // Tail of the sequential settings-save chain; every save waits for the previous one so
  // PATCHes reach the server in the order the changes were made.
  const settingsSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const pendingManualViewRef = useRef<ViewState | null>(null);
  const viewUpdateFrameRef = useRef<number | null>(null);
  const [committedView, setCommittedView] = useState<ViewState | null>(null);
  const markerWorldRef = useRef<HTMLDivElement | null>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const mapStageRef = useRef<HTMLDivElement | null>(null);
  const tileHighlightRef = useRef<HTMLDivElement | null>(null);
  const wildernessRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const view = manualView ?? urlCoordinateView ?? fittedView;
  const viewRef = useRef(view);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const markerView = isDragging && committedView !== null ? committedView : view;

  const applyMarkerWorldTransform = useCallback((nextView: ViewState, baseView: ViewState) => {
    const world = markerWorldRef.current;

    if (world === null) {
      return;
    }

    const ratio = nextView.zoom / baseView.zoom;
    const tx = nextView.x - ratio * baseView.x;
    const ty = nextView.y - ratio * baseView.y;

    world.style.transform = `translate3d(${formatPixels(tx)}, ${formatPixels(ty)}, 0) scale(${formatZoom(ratio)})`;
    world.style.transformOrigin = "0 0";
  }, []);

  const applyImageTransforms = useCallback((nextView: ViewState) => {
    for (const element of [mapImageRef.current, tileHighlightRef.current, wildernessRef.current]) {
      if (element !== null) {
        element.style.transform = `translate3d(${formatPixels(nextView.x)}, ${formatPixels(nextView.y)}, 0) scale(${formatZoom(nextView.zoom)})`;
        element.style.transformOrigin = "0 0";
      }
    }
  }, []);

  const applyMapStageTransform = useCallback((nextView: ViewState) => {
    const stage = mapStageRef.current;

    if (stage === null) {
      return;
    }

    stage.style.transform = `translate(${formatPixels(nextView.x)}, ${formatPixels(nextView.y)}) scale(${formatZoom(nextView.zoom)})`;
  }, []);

  const applyDirectTransforms = useCallback((nextView: ViewState, baseView: ViewState) => {
    applyImageTransforms(nextView);
    applyMapStageTransform(nextView);
    applyMarkerWorldTransform(nextView, baseView);
  }, [applyImageTransforms, applyMapStageTransform, applyMarkerWorldTransform]);

  useEffect(() => {
    if (!isDragging) {
      const world = markerWorldRef.current;

      if (world !== null) {
        world.style.transform = "";
        world.style.transformOrigin = "";
      }

      applyImageTransforms(view);
      applyMapStageTransform(view);
    }
  }, [isDragging, view, applyImageTransforms, applyMapStageTransform]);

  const flushPendingView = useCallback(() => {
    if (viewUpdateFrameRef.current !== null) {
      window.cancelAnimationFrame(viewUpdateFrameRef.current);
      viewUpdateFrameRef.current = null;
    }

    if (pendingManualViewRef.current !== null) {
      setManualView(pendingManualViewRef.current);
      pendingManualViewRef.current = null;
    }
  }, []);

  const scheduleViewUpdate = useCallback((nextView: ViewState) => {
    pendingManualViewRef.current = nextView;

    if (viewUpdateFrameRef.current === null) {
      viewUpdateFrameRef.current = window.requestAnimationFrame(() => {
        viewUpdateFrameRef.current = null;
        flushPendingView();
      });
    }
  }, [flushPendingView]);

  useEffect(() => {
    return () => {
      cancelHoverClose();
      cancelLongPress(longPressRef);
      flushPendingView();
    };
  }, [cancelHoverClose, flushPendingView]);
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
  // Wilderness depends on every deed, not just the ones matching the current search.
  const wildernessMarkers = useMemo(
    () => {
      if (dialog === null || dialog.mode !== "edit" || isPathMarker(dialog.marker)) {
        return allMarkers;
      }

      return allMarkers.map((marker) => marker.id === dialog.marker.id ? dialog.marker : marker);
    },
    [allMarkers, dialog]
  );
  const hoveredMarkers = hoveredMarker?.markers ?? [];
  const hiddenDeedLabelId = hoveredMarkers.find((marker) => marker.type === "deed")?.id ?? null;
  const hiddenTowerLabelId = hoveredMarkers.find((marker) => marker.type === "tower")?.id ?? null;
  const renderedSelectedCoordinate = selectedCoordinate ?? urlCoordinate;
  const eventFeedMapId = map?.id ?? null;
  const eventFeed = eventFeedState.mapId === eventFeedMapId ? eventFeedState.feed : null;
  const canViewMap = map !== null && viewer !== null && canReadMap({
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin,
    mapPermissions: viewer.mapPermissions
  }, map.id);
  const isShareMode = shareToken !== undefined;
  const uniqueAlertMapId = map?.id ?? null;
  // Read via useSyncExternalStore: the server snapshot is "not loaded" so the banner is decided
  // only after mount (localStorage is unavailable during SSR) without a hydration mismatch.
  const uniqueAlertSnapshot = useUniqueAlertSnapshot(uniqueAlertMapId);
  const slainAtMs = lastUniqueSlainAt === null ? Number.NaN : Date.parse(lastUniqueSlainAt);
  const isUniquePotentiallyAlive = lastUniqueSlainAt === null || (
    !Number.isNaN(slainAtMs) && uniqueAlertSnapshot.now - slainAtMs >= UNIQUE_RESPAWN_WINDOW_MS
  );
  const isUniqueAlertDismissed = uniqueAlertSnapshot.dismissedCycle === lastUniqueSlainAt;
  const showUniqueAlert = canViewMap && !isShareMode && uniqueAlertSnapshot.loaded &&
    isUniquePotentiallyAlive && !isUniqueAlertDismissed;
  useEffect(() => {
    if (uniqueAlertMapId === null) {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshUniqueAlertSnapshots();
      }
    }

    const intervalId = window.setInterval(refreshUniqueAlertSnapshots, UNIQUE_ALERT_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [uniqueAlertMapId]);
  const dismissUniqueAlert = useCallback(() => {
    if (uniqueAlertMapId === null) {
      return;
    }
    dismissUniqueAlertCycle(uniqueAlertMapId, lastUniqueSlainAt);
  }, [lastUniqueSlainAt, uniqueAlertMapId]);
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
  // Annotations are left alone: profiles are shared across servers, so loading one keeps this map's annotations.
  const applySettings = useCallback((settings: UserMapSettings) => {
    setEventFeedPanelSize(settings.eventFeedPanelSize);
    setFavoriteServerId(settings.favoriteServerId);
    setMarkerColors(settings.markerColors);
    setMarkerOpacities(settings.markerOpacities);
    setMarkerVisibility(settings.markerVisibility);
    setNoteCategoryColors(settings.noteCategoryColors);
    setNoteCategoryMarkerShapes(settings.noteCategoryMarkerShapes);
    setNoteCategoryPipSizes(settings.noteCategoryPipSizes);
    setRoadwayEditPanelPosition(settings.roadwayEditPanelPosition);
    setRoutePlannerSpeedKmh(settings.routePlannerSpeedKmh);
    setSearchLinesEnabled(settings.searchLinesEnabled);
    setTileHighlight(settings.tileHighlight);
    setTileHighlightPanelPosition(settings.tileHighlightPanelPosition);
  }, []);
  const resetUserMapSettings = useCallback(() => applySettings(DEFAULT_USER_MAP_SETTINGS), [applySettings]);
  const loadUserMapSettings = useCallback(
    (settings: UserMapSettings) => applySettings(parseUserMapSettings(settings)),
    [applySettings]
  );
  const enqueueSettingsSave = useCallback((mapId: string, settings: UserMapSettings): Promise<void> => {
    const next = settingsSaveChainRef.current.then(async () => {
      const result = await saveUserMapSettings(mapId, settings);
      setSettingsSaveError(result.ok ? null : result.error);
    });
    settingsSaveChainRef.current = next;
    return next;
  }, []);
  const flushPendingSettings = useCallback(async (): Promise<void> => {
    const pendingSave = pendingSettingsSaveRef.current;

    if (pendingSave !== null) {
      window.clearTimeout(pendingSave.timeoutId);
      pendingSettingsSaveRef.current = null;
      enqueueSettingsSave(pendingSave.mapId, pendingSave.settings);
    }

    await settingsSaveChainRef.current;
  }, [enqueueSettingsSave]);
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

    const result = await requestJson<{ feed?: WurmMapsEventFeed } | null>(`/api/maps/${map.id}/events`, undefined, "");
    setEventFeedState({ feed: result.ok ? result.body?.feed ?? null : null, mapId: map.id });
    setIsEventFeedLoading(false);
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

  const createNoteCategory = useCallback(async (input: NoteCategoryEditorInput): Promise<NoteCategoryMutationResult> => {
    if (map === null) {
      return { error: null, ok: false };
    }

    // The settings overlay shows a generic message for a failure without a server error ("" -> null).
    const result = await requestJson<{ category: NoteCategory }>(
      `/api/maps/${map.id}/note-categories`,
      jsonRequest("POST", input),
      ""
    );

    if (!result.ok) {
      return { error: result.error || null, ok: false };
    }

    const { category } = result.body;
    setNoteCategories((current) => upsertNoteCategory(current, category));
    return { category, ok: true };
  }, [map]);
  const renameNoteCategoryOnMarkers = useCallback((from: string, to: string) => {
    updateMarkers((current) => current.map((marker) => (
      marker.type === "note" && marker.category === from ? { ...marker, category: to } : marker
    )));
  }, [updateMarkers]);
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
  ): Promise<NoteCategoryMutationResult> => {
    if (map === null) {
      return { error: null, ok: false };
    }

    const previousCategory = noteCategories.find((category) => category.id === categoryId) ?? null;
    const result = await requestJson<{ category: NoteCategory }>(
      `/api/maps/${map.id}/note-categories/${categoryId}`,
      jsonRequest("PATCH", input),
      ""
    );

    if (!result.ok) {
      return { error: result.error || null, ok: false };
    }

    const { category } = result.body;
    setNoteCategories((current) => upsertNoteCategory(current, category));

    if (previousCategory !== null && previousCategory.name !== category.name) {
      renameNoteCategoryOnMarkers(previousCategory.name, category.name);
    }

    return { category, ok: true };
  }, [map, noteCategories, renameNoteCategoryOnMarkers]);
  const deleteNoteCategory = useCallback(async (categoryId: string): Promise<boolean> => {
    if (map === null) {
      return false;
    }

    const previousCategory = noteCategories.find((category) => category.id === categoryId) ?? null;
    const result = await requestJson<{ category: { id: string; reassignedTo: string } }>(
      `/api/maps/${map.id}/note-categories/${categoryId}`,
      { method: "DELETE" },
      ""
    );

    // The settings overlay reports a false result as a failed delete.
    if (!result.ok) {
      return false;
    }

    const { id, reassignedTo } = result.body.category;
    setNoteCategories((current) => current.filter((category) => category.id !== id));
    clearNoteCategoryPresentation(id);

    if (previousCategory !== null) {
      renameNoteCategoryOnMarkers(previousCategory.name, reassignedTo);
    }

    return true;
  }, [clearNoteCategoryPresentation, map, noteCategories, renameNoteCategoryOnMarkers]);
  const openDialog = useCallback((next: DialogState) => {
    // Marker dialogs overlap the top-panel overlays; close them so only one
    // panel is ever open at a time.
    setTopPanel(null);
    setDialog(next);
  }, []);
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

    openDialog({
      markerType,
      mode: "create",
      x: coordinate.x,
      y: coordinate.y
    });
  }, [openDialog, view]);
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

    openDialog({ marker, mode: "edit" });
  }, [openDialog]);
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
    // The URL coordinate only seeds the initial view; pin the displayed view so
    // writing x/y to the URL does not re-center the map on the clicked tile.
    setManualView((current) => current ?? viewRef.current);
    setSelectedCoordinate(coordinate);
    updateBrowserCoordinate(coordinate);
  }, []);

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    setManualView((currentManualView) => {
      const current = currentManualView ?? viewRef.current;
      const nextView = getZoomedView(
        viewport,
        mapSize,
        current.zoom * factor,
        { clientX, clientY },
        { x: (clientX - current.x) / current.zoom, y: (clientY - current.y) / current.zoom }
      );
      applyDirectTransforms(nextView, viewRef.current);
      return nextView;
    });
  }, [mapSize, viewport, applyDirectTransforms]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const factor = getWheelZoomFactor(event);

      // Pure horizontal scrolls (deltaY 0) carry no zoom intent.
      if (factor === null) {
        return;
      }

      cancelLongPress(longPressRef);
      setContextMenu(null);
      zoomAt(factor, event.clientX, event.clientY);
    },
    [zoomAt]
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

      setContextMenu({
        mapX: coordinate.x,
        mapY: coordinate.y,
        screenX: clientX,
        screenY: clientY,
        view: contextView,
        ...(canWriteMapMarkers && markersAtCoordinate.length > 0
          ? { markers: markersAtCoordinate, mode: "marker" as const }
          : { mode: "map" as const })
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
    const [firstPointer, secondPointer] = Array.from(activeTouchPointersRef.current.values());

    if (firstPointer === undefined || secondPointer === undefined) {
      return false;
    }

    const startDistance = getPointerDistance(firstPointer, secondPointer);

    if (startDistance < PINCH_MIN_DISTANCE_PX) {
      return false;
    }

    const center = getPointerCenter(firstPointer, secondPointer);
    const currentView = viewRef.current;
    setCommittedView(currentView);
    pinchZoomRef.current = {
      pointerIds: [firstPointer.pointerId, secondPointer.pointerId],
      startDistance,
      startMapX: (center.clientX - currentView.x) / currentView.zoom,
      startMapY: (center.clientY - currentView.y) / currentView.zoom,
      startZoom: currentView.zoom
    };
    dragRef.current = null;
    setIsDragging(false);
    cancelLongPress(longPressRef);
    setContextMenu(null);
    setHoveredMarker(null);
    return true;
  }, []);

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

      const currentView = viewRef.current;
      const coordinate = getMapCoordinate(event.clientX, event.clientY, currentView);

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
        view: currentView
      };
      setQuickDeedDraft({
        end: coordinate,
        start: coordinate
      });
      return true;
    },
    [canWriteMapMarkers, dialog, routePlannerEnabled, visualMap]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (openCoordinateContextMenu(event.clientX, event.clientY, view)) {
        event.preventDefault();
      }
    },
    [openCoordinateContextMenu, view]
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
      const currentView = viewRef.current;
      const eventCoordinate = getMapCoordinate(event.clientX, event.clientY, currentView);
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
        view: currentView
      });
    },
    [canWriteMapMarkers, displayedMarkersWithEditPreview, mapSize, markerVisibility, roadwayEditMode, selectCoordinate, visualMap]
  );

  const handleMarkerHoverMove = useCallback(
    (marker: WorkspaceMarker, event: React.MouseEvent<Element>) => {
      const coordinate = getMapCoordinate(event.clientX, event.clientY, viewRef.current);
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

      setHoveredMarker((current) => {
        if (
          current !== null &&
          coordinatesAreEqual(current.coordinate, coordinate) &&
          haveSameMarkers(current.markers, hoverMarkers)
        ) {
          // Same tile and same marker objects: only move the tooltip, keeping the markers array stable.
          // A changed marker (e.g. an edit preview or a saved update) gets a new object and re-renders.
          return current.screenX === event.clientX && current.screenY === event.clientY
            ? current
            : { ...current, screenX: event.clientX, screenY: event.clientY };
        }

        return {
          coordinate,
          markers: hoverMarkers,
          screenX: event.clientX,
          screenY: event.clientY
        };
      });
    },
    [displayedMarkersWithEditPreview, mapSize, markerVisibility, visualMap]
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

      const currentView = viewRef.current;
      const coordinate = getMapCoordinate(event.clientX, event.clientY, currentView);

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      deedResizeDragRef.current = {
        horizontalSide: coordinate.x <= marker.x ? "west" : "east",
        markerId: marker.id,
        pointerId: event.pointerId,
        verticalSide: coordinate.y <= marker.y ? "north" : "south",
        view: currentView
      };
      setContextMenu(null);
      setHoveredMarker(null);
    },
    [dialog]
  );

  const finishPointerDrag = useCallback((event: { clientX: number; clientY: number; ctrlKey?: boolean; pointerId: number; pointerType?: string }) => {
    const drag = dragRef.current;

    if (drag === null || drag.pointerId !== event.pointerId) {
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

      const viewportElement = event.target instanceof Element ? event.target.closest(".map-viewport") : null;

      if (viewportElement === null) {
        return;
      }

      trackTouchPointer(event);

      if (event.pointerType === "touch") {
        if (activeTouchPointersRef.current.size >= 2) {
          event.preventDefault();
          viewportElement.setPointerCapture?.(event.pointerId);
          startPinchZoomIfReady();
          return;
        }

        startLongPress(event, viewRef.current);
      }

      if (startQuickDeedDrag(event)) {
        viewportElement.setPointerCapture?.(event.pointerId);
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
      viewportElement.setPointerCapture?.(event.pointerId);
      const currentView = viewRef.current;
      setCommittedView(currentView);
      dragRef.current = {
        hasMoved: false,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: currentView.x,
        startY: currentView.y,
        startZoom: currentView.zoom
      };
      setIsDragging(true);
    }

    window.addEventListener("pointerdown", handleNativePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handleNativePointerDown);
    };
  }, [canWriteMapMarkers, routePlannerEnabled, startLongPress, startPinchZoomIfReady, startQuickDeedDrag, trackTouchPointer]);

  const hasMapViewport = canViewMap && visualMap !== null;

  useEffect(() => {
    const viewportElement = viewportRef.current;

    if (!hasMapViewport || viewportElement === null) {
      return;
    }

    // React registers wheel listeners as passive, so preventDefault would be ignored
    // and Ctrl+wheel / trackpad pinch would zoom the page instead of the map.
    viewportElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewportElement.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel, hasMapViewport]);

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
              const nextView = getZoomedView(
                viewport,
                mapSize,
                pinchZoom.startZoom * (distance / pinchZoom.startDistance),
                center,
                { x: pinchZoom.startMapX, y: pinchZoom.startMapY }
              );
              applyDirectTransforms(nextView, markerView);
              scheduleViewUpdate(nextView);
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

      const nextView = {
        x: drag.startX + deltaX,
        y: drag.startY + deltaY,
        zoom: drag.startZoom
      };
      applyDirectTransforms(nextView, markerView);
      scheduleViewUpdate(nextView);
    }

    function endDrag(event: PointerEvent) {
      if (event.pointerType === "touch") {
        activeTouchPointersRef.current.delete(event.pointerId);
        cancelLongPress(longPressRef);

        const pinchZoom = pinchZoomRef.current;

        if (pinchZoom !== null && pinchZoom.pointerIds.includes(event.pointerId)) {
          pinchZoomRef.current = null;
          dragRef.current = null;
          flushPendingView();
          setIsDragging(false);
          return;
        }
      }

      flushPendingView();
      finishPointerDrag(event);
    }

    return listenWindowPointer(handlePointerMove, endDrag);
  }, [applyDirectTransforms, finishPointerDrag, flushPendingView, mapSize, markerView, scheduleViewUpdate, viewport]);

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
      openDialog({
        initialDeedDimensions: quickDeed.dimensions,
        markerType: "deed",
        mode: "create",
        x: quickDeed.coordinate.x,
        y: quickDeed.coordinate.y
      });
    }

    return listenWindowPointer(handleQuickDeedDrag, endQuickDeedDrag);
  }, [openDialog, selectCoordinate, visualMap]);

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

    return listenWindowPointer(handlePathPointDrag, (event) => releaseDrag(pathPointDragRef, event));
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

    return listenWindowPointer(handleMarkerRelocationDrag, (event) => releaseDrag(markerRelocationDragRef, event));
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

    return listenWindowPointer(handleDeedResizeDrag, (event) => releaseDrag(deedResizeDragRef, event));
  }, [visualMap]);

  useEffect(() => {
    if (!canViewMap || map === null || isShareMode) {
      return;
    }

    if (!hasInitializedSettingsSaveRef.current) {
      hasInitializedSettingsSaveRef.current = true;
      return;
    }

    const pendingSave: PendingSettingsSave = {
      mapId: map.id,
      settings: userMapSettings,
      timeoutId: window.setTimeout(() => {
        if (pendingSettingsSaveRef.current === pendingSave) {
          pendingSettingsSaveRef.current = null;
        }

        void enqueueSettingsSave(pendingSave.mapId, pendingSave.settings);
      }, 250)
    };
    pendingSettingsSaveRef.current = pendingSave;

    return () => {
      // Leave the pending save in the ref: the next run replaces it, and on unmount
      // or pagehide it is still sent (with keepalive) instead of being dropped.
      window.clearTimeout(pendingSave.timeoutId);
    };
  }, [canViewMap, enqueueSettingsSave, isShareMode, map, userMapSettings]);

  useEffect(() => {
    function sendPendingSettingsWithKeepalive() {
      const pendingSave = pendingSettingsSaveRef.current;

      if (pendingSave === null) {
        return;
      }

      window.clearTimeout(pendingSave.timeoutId);
      pendingSettingsSaveRef.current = null;
      void saveUserMapSettings(pendingSave.mapId, pendingSave.settings, { keepalive: true });
    }

    window.addEventListener("pagehide", sendPendingSettingsWithKeepalive);

    return () => {
      window.removeEventListener("pagehide", sendPendingSettingsWithKeepalive);
      sendPendingSettingsWithKeepalive();
    };
  }, []);

  useEffect(() => {
    if (!canViewMap || map === null || isShareMode) {
      return;
    }

    const url = new URL(window.location.href);
    const currentServer = url.searchParams.get("server");
    const expectedSlug = getMapSlug(map.id);

    if (currentServer !== expectedSlug) {
      url.searchParams.set("server", expectedSlug);
      window.history.replaceState(null, "", url);
    }

    try {
      window.localStorage.setItem(LAST_MAP_STORAGE_KEY, map.id);
    } catch {
      // localStorage may be unavailable; the admin back link falls back to /map.
    }
  }, [canViewMap, isShareMode, map]);

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
      height: formatPixels(mapSize.heightPx),
      position: "absolute",
      top: 0,
      left: 0,
      transform: `translate3d(${formatPixels(view.x)}, ${formatPixels(view.y)}, 0) scale(${formatZoom(view.zoom)})`,
      transformOrigin: "0 0",
      width: formatPixels(mapSize.widthPx)
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
          ref={viewportRef}
        >
          <Image
            alt="Wurm Online map"
            className="map-image"
            draggable={false}
            height={visualMap.heightPx}
            onDragStart={preventNativeDrag}
            priority
            ref={mapImageRef}
            src={visualMap.imageSrc}
            style={imageStyle}
            unoptimized
            width={visualMap.widthPx}
          />
          <TileHighlightOverlay
            containerRef={tileHighlightRef}
            imageStyle={imageStyle}
            map={visualMap}
            tileHighlight={tileHighlight}
          />
          <WildernessOverlay
            color={markerColors.wildernessOverlay}
            containerRef={wildernessRef}
            layerName={selectedMapLayer?.name ?? null}
            markers={wildernessMarkers}
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
            ref={mapStageRef}
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
          <div
            ref={markerWorldRef}
            style={{
              height: `${mapSize.heightPx}px`,
              left: 0,
              pointerEvents: "none",
              position: "absolute",
              top: 0,
              width: `${mapSize.widthPx}px`
            }}
          >
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
              onHoverEnd={scheduleHoverClose}
              onHoverMove={handleMarkerHoverMove}
              onMarkerPointerDown={handleMarkerRelocationPointerDown}
              roadwayEditMode={roadwayEditMode}
              view={markerView}
              visibility={markerVisibility}
            />
            {pathDraft !== null ? (
              <PathDraftLayer
                draft={pathDraft}
                onPointPointerDown={handlePathPointPointerDown}
                view={markerView}
              />
            ) : null}
            {routePlannerPoints !== null ? (
              <RoutePlannerLayer
                points={routePlannerPoints}
                view={markerView}
              />
            ) : null}
            {searchLinesEnabled && searchTerm.length > 0 && renderedSelectedCoordinate !== null ? (
              <SearchLineLayer
                markers={displayedMarkersWithEditPreview}
                markerVisibility={markerVisibility}
                selectedCoordinate={renderedSelectedCoordinate}
                view={markerView}
              />
            ) : null}
            {quickDeedDraft !== null ? (
              <QuickDeedDraftLayer
                color={markerColors.deeds}
                draft={quickDeedDraft}
                opacity={markerOpacities.deeds}
                view={markerView}
              />
            ) : null}
            {(["deed", "tower"] as const).map((type) => (
              <NameLayer
                hiddenLabelId={type === "deed" ? hiddenDeedLabelId : hiddenTowerLabelId}
                key={type}
                markers={displayedMarkersWithEditPreview}
                type={type}
                view={markerView}
                visibility={markerVisibility}
              />
            ))}
            <SelectedCoordinateReticule coordinate={renderedSelectedCoordinate} view={markerView} />
          </div>
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
        >          {!isShareMode && map !== null ? (
            <MapSelectionControls
              layers={mapLayers}
              onLayerChange={(layerId) => {
                setSelectedMapLayerOverrideId(layerId);
                updateBrowserLayer(layerId);
              }}
              onServerChange={(serverId) => {
                if (serverId !== map.id) {
                  // Let a normal save finish first, but never let a stalled request block the switch
                  // (a save still in flight after the timeout is best-effort).
                  void Promise.race([
                    flushPendingSettings(),
                    new Promise<void>((resolve) => {
                      window.setTimeout(resolve, SERVER_SWITCH_SETTINGS_FLUSH_TIMEOUT_MS);
                    })
                  ]).then(() => navigateToServer(serverId));
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
      {showUniqueAlert ? (
        <UniqueAliveAlert
          lastUniqueSlainAt={lastUniqueSlainAt}
          now={uniqueAlertSnapshot.now}
          onDismiss={dismissUniqueAlert}
        />
      ) : null}
      {settingsSaveError !== null ? (
        <div className="map-settings-save-error" role="alert">
          <span>{settingsSaveError}</span>
          <button
            aria-label="Dismiss settings error"
            className="map-unique-alert-dismiss"
            onClick={() => setSettingsSaveError(null)}
            type="button"
          >
            ×
          </button>
        </div>
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
      {hoveredMarker !== null && contextMenu === null ? (
        <MarkerHoverDetails
          hoveredMarker={hoveredMarker}
          markerColors={markerColors}
          onMouseEnter={() => {
            isHoveringDetailsRef.current = true;
            cancelHoverClose();
          }}
          onMouseLeave={() => {
            isHoveringDetailsRef.current = false;
            scheduleHoverClose();
          }}
        />
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
          onSubmit={(event) => void submitMarkerForm(event, dialog, map.id, annotations.length, updateMarkers, setAnnotations, setDialog, setFormError).then((saved) => {
            if (saved) {
              setQuickDeedDraft(null);
            }
          })}
        />
      ) : null}
      {isShareMode ? null : (
      <div className="map-top-controls">
        <AccountOverlay
          isOpen={topPanel === "account"}
          onOpenChange={(isOpen) => setTopPanel(isOpen ? "account" : null)}
          servers={availableServers}
          viewer={viewer}
        />
        {canViewMap && map !== null ? (
          <MapSettingsOverlay
            isOpen={topPanel === "settings"}
            mapId={map.id}
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
            onFlushPendingSettings={flushPendingSettings}
            onLoadSettings={loadUserMapSettings}
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
      )}
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
          {!isShareMode && map !== null ? (
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
          {!isShareMode && map !== null ? (
            <ShareControl
              layerId={selectedMapLayer?.id ?? ""}
              mapId={map.id}
            />
          ) : null}
          {!isShareMode ? (
            <MapCountersControl
              isOpen={isCountersOpen}
              markers={markers}
              onOpenChange={setIsCountersOpen}
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

const toAddItems = (markerTypes: readonly MarkerType[]) =>
  markerTypes.map((markerType) => ({ label: MARKER_TYPE_LABELS[markerType], markerType }));
const ROADWAY_ADD_ITEMS = toAddItems(["bridge", "canal", "highway", "tunnel"]);
const MISC_ADD_ITEMS = toAddItems(["rift", "camp", "minedoor", "locateSoul"]);

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

function readDismissedUniqueAlertCycle(mapId: string): string | null | undefined {
  try {
    const raw = window.localStorage.getItem(UNIQUE_ALERT_DISMISSED_STORAGE_KEY);

    if (raw === null) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }

    const cycle = (parsed as Record<string, unknown>)[mapId];
    return typeof cycle === "string" || cycle === null ? cycle : undefined;
  } catch {
    return undefined;
  }
}

function writeDismissedUniqueAlertCycle(mapId: string, cycle: string | null): void {
  try {
    const raw = window.localStorage.getItem(UNIQUE_ALERT_DISMISSED_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    const store = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
    store[mapId] = cycle;
    window.localStorage.setItem(UNIQUE_ALERT_DISMISSED_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable; the dismissal simply will not persist.
  }
}

type UniqueAlertSnapshot = {
  dismissedCycle: string | null | undefined;
  loaded: boolean;
  now: number;
};

const SERVER_UNIQUE_ALERT_SNAPSHOT: UniqueAlertSnapshot = {
  dismissedCycle: undefined,
  loaded: false,
  now: 0
};

const uniqueAlertSnapshots = new Map<string, UniqueAlertSnapshot>();
const uniqueAlertListeners = new Set<() => void>();

function subscribeToUniqueAlertSnapshot(listener: () => void): () => void {
  uniqueAlertListeners.add(listener);

  return () => {
    uniqueAlertListeners.delete(listener);
  };
}

function getUniqueAlertSnapshot(mapId: string | null): UniqueAlertSnapshot {
  if (mapId === null || typeof window === "undefined") {
    return SERVER_UNIQUE_ALERT_SNAPSHOT;
  }

  const cached = uniqueAlertSnapshots.get(mapId);

  if (cached !== undefined) {
    return cached;
  }

  const snapshot: UniqueAlertSnapshot = {
    dismissedCycle: readDismissedUniqueAlertCycle(mapId),
    loaded: true,
    now: Date.now()
  };
  uniqueAlertSnapshots.set(mapId, snapshot);
  return snapshot;
}

function getServerUniqueAlertSnapshot(): UniqueAlertSnapshot {
  return SERVER_UNIQUE_ALERT_SNAPSHOT;
}

function dismissUniqueAlertCycle(mapId: string, cycle: string | null): void {
  writeDismissedUniqueAlertCycle(mapId, cycle);
  uniqueAlertSnapshots.delete(mapId);
  notifyUniqueAlertListeners();
}

// Drops the cached snapshots so a long-lived tab re-reads the clock (and dismissals) and the
// alert appears once the respawn window passes.
function refreshUniqueAlertSnapshots(): void {
  uniqueAlertSnapshots.clear();
  notifyUniqueAlertListeners();
}

function notifyUniqueAlertListeners(): void {
  for (const listener of uniqueAlertListeners) {
    listener();
  }
}

function useUniqueAlertSnapshot(mapId: string | null): UniqueAlertSnapshot {
  return useSyncExternalStore(
    subscribeToUniqueAlertSnapshot,
    () => getUniqueAlertSnapshot(mapId),
    getServerUniqueAlertSnapshot
  );
}

function getUniqueAliveAlertMessage(lastUniqueSlainAt: string | null, now: number): string {
  if (lastUniqueSlainAt === null) {
    return "Potentially a unique alive — no kill recorded";
  }

  const days = Math.floor((now - Date.parse(lastUniqueSlainAt)) / (24 * 60 * 60 * 1000));
  return `Potentially a unique alive — last slain ${days} ${days === 1 ? "day" : "days"} ago`;
}

function UniqueAliveAlert({
  lastUniqueSlainAt,
  now,
  onDismiss
}: {
  lastUniqueSlainAt: string | null;
  now: number;
  onDismiss(): void;
}) {
  return (
    <div className="map-unique-alert" role="status">
      <span className="map-unique-alert-message">{getUniqueAliveAlertMessage(lastUniqueSlainAt, now)}</span>
      <button
        aria-label="Dismiss unique alert"
        className="map-unique-alert-dismiss"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
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

function PanelToggleButton({
  isOpen,
  label,
  name,
  onClick
}: {
  isOpen: boolean;
  label: string;
  name: "counters" | "event-feed" | "legend" | "share";
  onClick(): void;
}) {
  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label={label}
      className={isOpen ? `map-${name}-button is-active` : `map-${name}-button`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className={`map-${name}-button-icon`} />
    </button>
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
      <PanelToggleButton isOpen={isOpen} label="Map legend" name="legend" onClick={() => onOpenChange(!isOpen)} />
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

function MapCountersControl({
  isOpen,
  markers,
  onOpenChange
}: {
  isOpen: boolean;
  markers: WorkspaceMarker[];
  onOpenChange(isOpen: boolean): void;
}) {
  const counters = useMemo(() => getMarkerCounters(markers), [markers]);

  return (
    <div className="map-counters-control">
      <PanelToggleButton isOpen={isOpen} label="Map counters" name="counters" onClick={() => onOpenChange(!isOpen)} />
      {isOpen ? (
        <section aria-label="Map counters" className="map-counters-panel" role="dialog">
          <strong>Counters</strong>
          <dl>
            {counters.map((counter) => (
              <div key={counter.id}>
                <dt>{counter.label}</dt>
                <dd data-testid={`counter-${counter.id}`}>{counter.count.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function getMarkerCounters(markers: WorkspaceMarker[]): { count: number; id: string; label: string }[] {
  let deeds = 0;
  let notes = 0;
  let plannedTowers = 0;
  let towers = 0;

  for (const marker of markers) {
    if (marker.type === "deed") {
      deeds += 1;
    } else if (marker.type === "note") {
      notes += 1;
    } else if (marker.type === "tower") {
      if (marker.planned === true) {
        plannedTowers += 1;
      } else {
        towers += 1;
      }
    }
  }

  return [
    { count: deeds, id: "deeds", label: "Deeds" },
    { count: notes, id: "notes", label: "Notes" },
    { count: towers, id: "towers", label: "Towers" },
    { count: plannedTowers, id: "planned-towers", label: "Planned towers" }
  ];
}

type ShareControlLink = {
  absoluteUrl: string;
  expiresAt: string;
};

function ShareControl({
  layerId,
  mapId
}: {
  layerId: string;
  mapId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(SHARE_LINK_DEFAULT_HOURS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<ShareControlLink | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const shareUrlInputRef = useRef<HTMLInputElement | null>(null);

  async function generateShareLink() {
    setIsGenerating(true);
    setShareError(null);
    setShareLink(null);
    setIsCopied(false);

    const result = await requestJson(
      `/api/maps/${mapId}/share`,
      jsonRequest("POST", layerId.length > 0 ? { expiresInHours, layerId } : { expiresInHours }),
      "Share link could not be created"
    );
    const created = result.ok ? parseShareLinkResponse(result.body) : null;

    if (created === null) {
      setShareError(result.ok ? "Share link could not be created" : result.error);
    } else {
      setShareLink({
        absoluteUrl: `${window.location.origin}${created.url}`,
        expiresAt: created.expiresAt
      });
    }

    setIsGenerating(false);
  }

  async function copyShareLink() {
    if (shareLink === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink.absoluteUrl);
      setIsCopied(true);
    } catch {
      shareUrlInputRef.current?.select();
    }
  }

  return (
    <div className="map-share-control">
      <PanelToggleButton isOpen={isOpen} label="Share map" name="share" onClick={() => setIsOpen((current) => !current)} />
      {isOpen ? (
        <section aria-label="Share read-only link" className="map-share-panel" role="dialog">
          <div className="map-share-panel-title">
            <strong>Share Map</strong>
            <span className="map-share-info">
              <span aria-hidden="true" className="map-share-info-icon">i</span>
              <span className="map-share-tooltip" role="tooltip">
                <span>
                  This tool generates a shared link for you to share with other players, best used
                  with those who do not have an account or map access. When you generate a link,
                  your settings are copied at the time of creation — meaning if you have towers
                  disabled, they also won&apos;t see towers. The users who use this link will not
                  be able to change any settings, or go to any other map.
                </span>
              </span>
            </span>
          </div>
          <label className="map-share-expiry">
            <span>
              Expires in
              <input
                aria-label="Expires in hours"
                max={SHARE_LINK_MAX_HOURS}
                min={SHARE_LINK_MIN_HOURS}
                onBlur={(event) => setExpiresInHours(clampShareLinkHours(Number(event.target.value)))}
                onChange={(event) => setExpiresInHours(clampShareLinkHours(Number(event.target.value)))}
                step={1}
                type="number"
                value={expiresInHours}
              />
              hours
            </span>
            <small className="map-share-expiry-hint">max 24</small>
          </label>
          <button
            className="map-share-generate"
            disabled={isGenerating}
            onClick={() => void generateShareLink()}
            type="button"
          >
            {isGenerating ? "Generating…" : "Generate link"}
          </button>
          {shareError !== null ? (
            <p className="map-share-error" role="alert">{shareError}</p>
          ) : null}
          {shareLink !== null ? (
            <div className="map-share-result">
              <input
                aria-label="Share link URL"
                className="map-share-url"
                readOnly
                ref={shareUrlInputRef}
                value={shareLink.absoluteUrl}
              />
              <button
                className="map-share-copy"
                onClick={() => void copyShareLink()}
                type="button"
              >
                {isCopied ? "Copied" : "Copy"}
              </button>
              <span className="map-share-expires">
                Expires {new Date(shareLink.expiresAt).toLocaleString()}
              </span>
            </div>
          ) : null}
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
  return (
    <div className="map-event-feed-control">
      <PanelToggleButton isOpen={isOpen} label={`${serverName} events`} name="event-feed" onClick={() => onOpenChange(!isOpen)} />
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

    return listenWindowPointer(handleResizeDrag, (event) => releaseDrag(resizeDragRef, event));
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

const LEGEND_VARIANTS: Array<[MarkerType, LegendItem["variant"]]> = [
  ["annotation", "triangle"],
  ["tower", "square"],
  ["deed", "square"],
  ["note", "circle"],
  ["rift", "triangle"],
  ["camp", "triangle"],
  ["minedoor", "minedoor"],
  ["locateSoul", "triangle"],
  ["bridge", "line"],
  ["canal", "line"],
  ["highway", "line"],
  ["tunnel", "line"]
];

function getLegendItems(markerColors: MarkerColors): LegendItem[] {
  return LEGEND_VARIANTS.map(([type, variant]) => ({
    color: markerColors[getMarkerTypeKey(type)],
    id: type === "locateSoul" ? "locate-soul" : type,
    label: MARKER_TYPE_LABELS[type],
    variant
  }));
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
          points={getPathSvgPoints(draft.points, draft.width, view)}
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
    <section className="map-path-draft-panel" role="dialog" aria-label={`Draw ${MARKER_TYPE_LABELS[draft.type]}`}>
      <DialogHeader closeLabel="Close marker dialog" title={`Draw ${MARKER_TYPE_LABELS[draft.type]}`} onClose={onCancel} />
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

function NameLayer({
  hiddenLabelId,
  markers,
  type,
  view,
  visibility
}: {
  hiddenLabelId: string | null;
  markers: WorkspaceMarker[];
  type: "deed" | "tower";
  view: ViewState;
  visibility: MarkerVisibility;
}) {
  if (type === "deed" ? !visibility.deeds || !visibility.deedNames : !visibility.towers || !visibility.towerNames) {
    return null;
  }

  return (
    <div aria-label={type === "deed" ? "Deed names" : "Tower names"} className="map-deed-name-layer">
      {markers.map((marker) => {
        if (marker.type !== type || marker.id === hiddenLabelId) {
          return null;
        }

        return (
          <span
            className={marker.type === "deed" ? "map-deed-name-label" : "map-deed-name-label map-tower-name-label"}
            data-testid={`${type}-name-label-${marker.id}`}
            key={marker.id}
            style={marker.type === "deed" ? getDeedNameLabelStyle(marker, view) : getTowerNameLabelStyle(marker, view)}
          >
            {marker.type === "deed" ? marker.name : formatTowerCreator(marker)}
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
  containerRef,
  imageStyle,
  map,
  tileHighlight
}: {
  containerRef: React.Ref<HTMLDivElement>;
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
        setOverlay({
          key: overlayKey,
          src: renderTileHighlightDataUrl(mask, map)
        });
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
      ref={containerRef}
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
  containerRef,
  layerName,
  map,
  markers,
  imageStyle,
  mapSize,
  opacity,
  visible
}: {
  color: string;
  containerRef: React.Ref<HTMLDivElement>;
  layerName: string | null;
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
    if (map === null || layerName === null) return null;
    const server = map.name.toLowerCase();
    const layerSuffix = layerName === "Terrain" ? "terrain" : "topo";
    return `/maps/${server}-${layerSuffix}-water-mask.png`;
  }, [map, layerName]);

  const canvasKey = useMemo(() => {
    const deedKey = deeds
      .map((deed) => `${deed.id}:${deed.x}:${deed.y}:${deed.north}:${deed.south}:${deed.east}:${deed.west}:${deed.perimeter}`)
      .join(",");
    return `${mapSize.widthPx}x${mapSize.heightPx}|${color}|${deedKey}|${waterMaskUrl ?? "no-mask"}`;
  }, [color, mapSize, deeds, waterMaskUrl]);

  const sizeKey = `${mapSize.widthPx}x${mapSize.heightPx}`;
  // The built image remembers the map size it was drawn for, so a layer/size change never
  // stretches a stale canvas over the new map.
  const [overlay, setOverlay] = useState<{ sizeKey: string; src: string } | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  if (wasVisible !== visible) {
    // Drop the old image while hidden so re-showing never flashes deeds that have since changed.
    setWasVisible(visible);

    if (!visible) {
      setOverlay(null);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    if (!visible || deeds.length === 0) {
      return () => {
        isCancelled = true;
      };
    }

    // The first build (and one after hiding or a map size change) runs immediately; later
    // rebuilds (e.g. every pointermove while a deed is dragged or resized) are debounced so the
    // full-map canvas is redrawn once idle while the current image stays up.
    const rebuildDelayMs = overlay !== null && overlay.sizeKey === sizeKey ? WILDERNESS_REBUILD_DEBOUNCE_MS : 0;
    const timeoutId = window.setTimeout(() => {
      const canvasWidth = mapSize.widthPx;
      const canvasHeight = mapSize.heightPx;
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");

      if (ctx === null) {
        if (!isCancelled) {
          setOverlay(null);
        }
        return;
      }

      const DEED_EXCLUSION_DISTANCE_TILES = 30;
      const MAP_EDGE_INSET_TILES = 510;

      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.globalCompositeOperation = "destination-out";

      // Uniques cannot spawn within 510 tiles of the map edge.
      const innerLeft = MAP_EDGE_INSET_TILES;
      const innerTop = MAP_EDGE_INSET_TILES;
      const innerRight = canvasWidth - MAP_EDGE_INSET_TILES;
      const innerBottom = canvasHeight - MAP_EDGE_INSET_TILES;

      ctx.fillRect(0, 0, canvasWidth, innerTop);
      ctx.fillRect(0, innerBottom, canvasWidth, canvasHeight - innerBottom);
      ctx.fillRect(0, innerTop, innerLeft, innerBottom - innerTop);
      ctx.fillRect(innerRight, innerTop, canvasWidth - innerRight, innerBottom - innerTop);

      for (const deed of deeds) {
        const maxEW = Math.max(deed.east, deed.west) + deed.perimeter;
        const maxNS = Math.max(deed.north, deed.south) + deed.perimeter;
        const radius = Math.sqrt(maxEW * maxEW + maxNS * maxNS) + DEED_EXCLUSION_DISTANCE_TILES;
        const cx = deed.x;
        const cy = deed.y;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const applyMask = () => {
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
        setOverlay({ sizeKey: `${canvasWidth}x${canvasHeight}`, src: canvas.toDataURL() });
      };

      if (waterMaskUrl !== null) {
        const maskImg = document.createElement("img");
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          if (!isCancelled) {
            ctx.drawImage(maskImg, 0, 0);
            applyMask();
          }
        };
        maskImg.onerror = () => {
          if (!isCancelled) {
            applyMask();
          }
        };
        maskImg.src = waterMaskUrl;
      } else {
        applyMask();
      }
    }, rebuildDelayMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
    // canvasKey already encodes color, mapSize, and deeds; adding them would be redundant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasKey, visible, waterMaskUrl]);

  // Without deeds nothing is rebuilt, so never show a canvas left over from earlier deeds.
  if (!visible || overlay === null || overlay.sizeKey !== sizeKey || deeds.length === 0) {
    return null;
  }

  const overlaySrc = overlay.src;

  return (
    <div
      ref={containerRef}
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
      <MarkerContextRows
        coordinate={{ x: contextMenu.mapX, y: contextMenu.mapY }}
        markerColors={markerColors}
        markers={contextMenu.markers}
        onDelete={onDelete}
        onEdit={onEdit}
      />
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
          points={getPathSvgPoints(points, 1, view)}
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
  const title = dialog.mode === "create" ? `Add ${MARKER_TYPE_LABELS[markerType].toLowerCase()}` : `Edit ${getMarkerTitle(dialog.marker)}`;
  const coordinate = dialog.mode === "create"
    ? { x: dialog.x, y: dialog.y }
    : { x: dialog.marker.x, y: dialog.marker.y };
  const disbandableDeed = dialog.mode === "edit" && dialog.marker.type === "deed"
    ? dialog.marker
    : null;

  return (
    <section className="map-marker-dialog" role="dialog" aria-label={title}>
      <DialogHeader closeLabel="Close marker dialog" title={title} onClose={onClose} />
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
  markerColors,
  onMouseEnter,
  onMouseLeave
}: {
  hoveredMarker: HoveredMarkerState;
  markerColors: MarkerColors;
  onMouseEnter(): void;
  onMouseLeave(): void;
}) {
  const title = `Map items at ${hoveredMarker.coordinate.x}, ${hoveredMarker.coordinate.y}`;

  return (
    <section
      aria-label={title}
      className="map-hover-details"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
        <label>
          <span>Title</span>
          <input
            defaultValue={annotation?.title ?? ""}
            maxLength={MAX_ANNOTATION_TITLE_LENGTH}
            name="title"
            required
          />
        </label>
        <label>
          <span>Text</span>
          <textarea defaultValue={annotation?.text ?? ""} maxLength={MAX_ANNOTATION_TEXT_LENGTH} name="text" />
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

const TOWER_TEXT_FIELDS = [
  { label: "QL", name: "ql" },
  { label: "Damage", name: "damage" },
  { label: "Creator", name: "creator" }
] as const;

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
      {TOWER_TEXT_FIELDS.map(({ label, name }) => (
        <label key={name}>
          <span>{label}</span>
          <input
            name={name}
            value={towerFields[name]}
            onChange={(event) => {
              const value = event.currentTarget.value;

              setTowerFields((current) => ({ ...current, [name]: value }));
            }}
          />
        </label>
      ))}
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

type LocateSoulMarker = Extract<WorkspaceMarker, { type: "locateSoul" }>;

const LOCATE_SOUL_FORM_DISTANCE_PHRASES: Record<Exclude<LocateSoulMarker["distanceBand"], "0">, string> = {
  "1-3": "a stone's throw away",
  "4-5": "very close",
  "6-9": "pretty close by",
  "10-19": "fairly close by",
  "20-49": "some distance away",
  "50-199": "quite some distance away",
  "200-499": "rather a long distance away",
  "500-999": "pretty far away",
  "1000+": "far away",
  "2000+": "very far away"
};

const LOCATE_SOUL_FORM_DIRECTION_PHRASES: Record<LocateSoulMarker["direction"], string> = {
  ahead: "ahead of you",
  aheadLeft: "ahead of you to the left",
  aheadRight: "ahead of you to the right",
  behind: "behind you",
  behindLeft: "behind you to the left",
  behindRight: "behind you to the right",
  left: "to the left",
  right: "to the right"
};

function formatLocateSoulOutputForForm(marker: LocateSoulMarker): string {
  if (marker.distanceBand === "0") {
    return `You are practically standing on ${marker.targetName}!`;
  }

  return `${marker.targetName} is ${LOCATE_SOUL_FORM_DISTANCE_PHRASES[marker.distanceBand]} ${LOCATE_SOUL_FORM_DIRECTION_PHRASES[marker.direction]}.`;
}

async function submitMarkerForm(
  event: FormEvent<HTMLFormElement>,
  dialog: DialogState,
  mapId: string,
  annotationCount: number,
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
    // Annotations are saved with the user's map settings, which the server rejects past these caps.
    if (dialog.mode === "create" && annotationCount >= MAX_ANNOTATIONS) {
      setFormError(`You can keep at most ${MAX_ANNOTATIONS} annotations; delete one to add another`);
      return false;
    }

    const annotation = buildAnnotationMarker(dialog, payloadResult.payload);

    if (annotation.title.trim().length > MAX_ANNOTATION_TITLE_LENGTH) {
      setFormError(`Title must be ${MAX_ANNOTATION_TITLE_LENGTH} characters or fewer`);
      return false;
    }

    if (annotation.text.trim().length > MAX_ANNOTATION_TEXT_LENGTH) {
      setFormError(`Text must be ${MAX_ANNOTATION_TEXT_LENGTH} characters or fewer`);
      return false;
    }

    setAnnotations((current) => upsertById(current, annotation));
    setDialog(null);
    setFormError(null);
    return true;
  }

  const url = dialog.mode === "edit"
    ? `/api/markers/${dialog.marker.type}/${dialog.marker.id}`
    : `/api/maps/${mapId}/markers`;

  const result = await requestJson<{ marker: WorkspaceMarker }>(
    url,
    jsonRequest(dialog.mode === "edit" ? "PATCH" : "POST", payloadResult.payload),
    "Marker could not be saved"
  );

  if (!result.ok) {
    setFormError(result.error);
    return false;
  }

  setMarkers((current) => upsertById(current, result.body.marker));
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

  const result = await requestJson(
    `/api/markers/${marker.type}/${marker.id}`,
    { method: "DELETE" },
    "Marker could not be deleted"
  );

  if (!result.ok) {
    setFormError(result.error);
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
  const result = await requestJson<{ category: NoteCategory; deletedMarkerId: string; marker: WorkspaceMarker }>(
    `/api/markers/deed/${marker.id}/disband`,
    { method: "POST" },
    "Deed could not be marked disbanded"
  );

  if (!result.ok) {
    setFormError(result.error);
    return;
  }

  const { body } = result;
  setNoteCategories((current) => upsertNoteCategory(current, body.category));
  setMarkers((current) => upsertById(
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

  const { name, notes, points, type, width } = draft;
  const result = await requestJson<{ marker: WorkspaceMarker }>(
    draft.mode === "edit" && draft.id !== undefined ? `/api/markers/${type}/${draft.id}` : `/api/maps/${mapId}/markers`,
    jsonRequest(draft.mode === "edit" ? "PATCH" : "POST", { name, notes, points, type, width }),
    "Path could not be saved"
  );

  if (!result.ok) {
    setFormError(result.error);
    return;
  }

  setMarkers((current) => upsertById(current, result.body.marker));
  setPathDraft(null);
  setFormError(null);
}

async function createAutoplannedTower(
  coordinate: MapCoordinate,
  mapId: string,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  const fallbackError = "Planned tower could not be created";
  const result = await requestJson<{ marker: WorkspaceMarker }>(`/api/maps/${mapId}/markers`, jsonRequest("POST", {
    damage: "",
    makerName: "",
    makerNumber: "",
    planned: true,
    ql: "",
    towerType: DEFAULT_TOWER_TYPE,
    type: "tower",
    x: coordinate.x,
    y: coordinate.y
  }), fallbackError);

  if (!result.ok || result.body.marker.type !== "tower") {
    setFormError(result.ok ? fallbackError : result.error);
    return;
  }

  const { marker } = result.body;
  setMarkers((current) => upsertById(current, marker));
  setFormError(null);
}

type SettingsSaveResult = { ok: true } | { error: string; ok: false };

async function saveUserMapSettings(
  mapId: string,
  settings: UserMapSettings,
  options: { keepalive?: boolean } = {}
): Promise<SettingsSaveResult> {
  const body = JSON.stringify(settings);
  // Browsers reject keepalive bodies over 64KB, so larger payloads fall back to a
  // normal (best-effort) request that may not survive the page unloading.
  const keepalive = options.keepalive === true && getUtf8ByteLength(body) <= MAX_KEEPALIVE_BODY_BYTES;

  try {
    const response = await fetch(`/api/maps/${mapId}/settings`, {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
      ...(keepalive ? { keepalive: true } : {})
    });

    if (response?.ok === false) {
      return { error: (await readResponseError(response)) ?? SETTINGS_SAVE_ERROR_MESSAGE, ok: false };
    }

    return { ok: true };
  } catch {
    return { error: SETTINGS_SAVE_ERROR_MESSAGE, ok: false };
  }
}

// One mouse-wheel notch (~100px) zooms by ZOOM_STEP; trackpad scrolls and pinches, which send
// many small deltas, zoom proportionally. Each event is clamped to a single ZOOM_STEP.
function getWheelZoomFactor(event: Pick<WheelEvent, "deltaMode" | "deltaY">): number | null {
  if (event.deltaY === 0 || !Number.isFinite(event.deltaY)) {
    return null;
  }

  const deltaPx = event.deltaMode === WHEEL_DELTA_LINE
    ? event.deltaY * WHEEL_LINE_HEIGHT_PX
    : event.deltaMode === WHEEL_DELTA_PAGE
      ? event.deltaY * WHEEL_PAGE_HEIGHT_PX
      : event.deltaY;
  const factor = Math.exp((-deltaPx / WHEEL_NOTCH_PX) * Math.log(ZOOM_STEP));

  return clamp(factor, 1 / ZOOM_STEP, ZOOM_STEP);
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function clampShareLinkHours(value: number): number {
  if (!Number.isFinite(value)) {
    return SHARE_LINK_DEFAULT_HOURS;
  }

  return Math.min(SHARE_LINK_MAX_HOURS, Math.max(SHARE_LINK_MIN_HOURS, Math.round(value)));
}

function parseShareLinkResponse(body: unknown): { expiresAt: string; url: string } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { expiresAt, url } = body as Record<string, unknown>;

  if (typeof expiresAt !== "string" || typeof url !== "string") {
    return null;
  }

  return { expiresAt, url };
}

type MarkerPayloadResult =
  | { error: string; ok: false }
  | { ok: true; payload: Record<string, unknown> };

// Plain form fields per marker type, in payload key order; tower, note, locate soul and paths are built by hand.
const MARKER_FORM_FIELDS: Partial<Record<MarkerType, readonly string[]>> = {
  annotation: ["text", "title"],
  camp: ["campType", "notes"],
  deed: ["east", "foundingDate", "founder", "name", "north", "perimeter", "south", "west"],
  minedoor: ["notes", "strength"],
  rift: ["arrivalDate", "estimatedRiftTime", "notes"]
};
const NUMERIC_FORM_FIELDS = new Set(["east", "north", "perimeter", "south", "west", "x", "y"]);

function buildMarkerPayload(markerType: MarkerType, formData: FormData): MarkerPayloadResult {
  const str = (name: string, fallback = "") => String(formData.get(name) ?? fallback);
  const fields = (names: readonly string[]) => Object.fromEntries(names.map((name) => [
    name,
    NUMERIC_FORM_FIELDS.has(name) ? Number(formData.get(name)) : str(name)
  ]));
  const base = { type: markerType, ...fields(["x", "y"]) };

  if (markerType === "tower") {
    const creator = parseCreatorInput(str("creator"));

    return {
      ok: true,
      payload: {
        ...base,
        damage: str("damage"),
        makerName: creator.makerName,
        makerNumber: creator.makerNumber,
        planned: formData.get("planned") === "on",
        ql: str("ql"),
        towerType: str("towerType", DEFAULT_TOWER_TYPE)
      }
    };
  }

  if (markerType === "locateSoul") {
    const locateSoul = parseLocateSoulMessage(str("locateSoulOutput"));

    if (locateSoul === null) {
      return {
        error: "Paste a Locate Soul result that includes a target, distance, and direction.",
        ok: false
      };
    }

    const { direction, distanceBand, targetName } = locateSoul;
    return {
      ok: true,
      payload: { ...base, casterFacing: str("casterFacing"), direction, distanceBand, notes: str("notes"), targetName }
    };
  }

  if (isPathMarkerType(markerType)) {
    return { ok: true, payload: { ...fields(["name", "notes"]), points: [], type: markerType, width: 1 } };
  }

  if (markerType === "note") {
    return { ok: true, payload: { category: str("category"), ...base, ...fields(["title", "text"]) } };
  }

  return { ok: true, payload: { ...base, ...fields(MARKER_FORM_FIELDS[markerType] ?? []) } };
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

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];
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

function getMapSize(map: { heightPx: number; widthPx: number } | null) {
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

function getPathPointStyle(point: MapCoordinate, width: number, view: ViewState): CSSProperties {
  const offset = getPathCoordinateOffset(width);

  return getScreenCoordinateStyle({
    x: point.x + offset - 0.5,
    y: point.y + offset - 0.5
  }, view);
}

function getDefaultPathColor(type: PathMarkerType): string {
  return DEFAULT_USER_MAP_SETTINGS.markerColors[getMarkerTypeKey(type)];
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

function getZoomedView(
  viewport: ViewportSize,
  mapSize: { heightPx: number; widthPx: number },
  nextZoom: number,
  anchor: { clientX: number; clientY: number },
  anchorMap: MapCoordinate
): ViewState {
  const minZoom = getFitZoom(viewport, mapSize);

  if (nextZoom <= minZoom) {
    return getFitView(viewport, mapSize);
  }

  const zoom = clamp(nextZoom, minZoom, MAX_ZOOM);
  return { x: anchor.clientX - anchorMap.x * zoom, y: anchor.clientY - anchorMap.y * zoom, zoom };
}

function listenWindowPointer(move: (event: PointerEvent) => void, end: (event: PointerEvent) => void): () => void {
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  return () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
}

function releaseDrag(ref: { current: { pointerId: number } | null }, event: PointerEvent) {
  if (ref.current?.pointerId === event.pointerId) {
    ref.current = null;
  }
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
  if (marker.type === "rift") {
    return true;
  }

  if (marker.type === "tower") {
    return visibility.towers && (marker.planned !== true || visibility.plannedTowers);
  }

  return visibility[getMarkerTypeKey(marker.type)];
}

function markerMatchesSearch(marker: WorkspaceMarker, searchTerm: string): boolean {
  if (isPathMarker(marker)) {
    return false;
  }

  return getMarkerSearchText(marker).toLowerCase().includes(searchTerm);
}

function getMarkerSearchText(marker: Exclude<WorkspaceMarker, { type: PathMarkerType }>): string {
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

function haveSameMarkers(first: readonly WorkspaceMarker[], second: readonly WorkspaceMarker[]): boolean {
  return first.length === second.length && first.every((marker, index) => marker === second[index]);
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

  if (marker.type === "note") {
    return `Note ${marker.category} - ${marker.title}`;
  }

  return MARKER_TYPE_LABELS[marker.type];
}

function getMarkerLastModifiedBy(marker: WorkspaceMarker): string {
  return "lastModifiedBy" in marker ? marker.lastModifiedBy ?? "Unknown" : "Unknown";
}

function getMarkerAtCoordinateLabel(marker: WorkspaceMarker): string {
  if (marker.type === "tower") {
    return `Tower ${formatTowerCreator(marker)}`;
  }

  if (marker.type === "deed") {
    return `Deed ${marker.name}`;
  }

  if (marker.type === "camp") {
    return `Camp ${marker.campType}`;
  }

  if (marker.type === "locateSoul") {
    return `Locate Soul ${marker.targetName}`;
  }

  if (isPathMarker(marker)) {
    return `${MARKER_TYPE_LABELS[marker.type]} ${marker.name || "path"}`;
  }

  return getMarkerTitle(marker);
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
    return marker.name || MARKER_TYPE_LABELS[marker.type];
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
    return `${MARKER_TYPE_LABELS[marker.type]} | ${marker.points.length} points | Width ${marker.width}`;
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
  return markerColors[getMarkerTypeKey(marker.type)];
}

function formatDeedDimensions(marker: Extract<WorkspaceMarker, { type: "deed" }>): string {
  return `${marker.west + marker.east + 1}x${marker.north + marker.south + 1}`;
}

function getHoverDetailsStyle(screenX: number, screenY: number): CSSProperties {
  const { left, top } = getBoundedFixedPosition(
    screenX + HOVER_DETAILS_OFFSET_PX,
    screenY + HOVER_DETAILS_OFFSET_PX,
    HOVER_DETAILS_MAX_WIDTH_PX,
    HOVER_DETAILS_MAX_HEIGHT_PX
  );

  return { left, top };
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

function formatZoom(value: number): string {
  return Number(value.toFixed(4)).toString();
}
