"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent
} from "react";
import { canReadMap, canWriteMarkers } from "@/lib/domain/permissions";
import type {
  MarkerColors,
  MarkerType,
  MarkerVisibility,
  NoteCategory,
  WorkspaceMap,
  WorkspaceMarker
} from "@/lib/markers/marker-types";
import { AccountOverlay, type AccountViewer } from "./account-overlay";
import { MapSettingsOverlay } from "./map-settings-overlay";
import { MarkerLayer } from "./marker-layer";

const FALLBACK_MAP_SIZE_PX = 2048;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.2;
const SERVER_VIEWPORT_SNAPSHOT = `${FALLBACK_MAP_SIZE_PX}x${FALLBACK_MAP_SIZE_PX}`;
const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = {
  deeds: true,
  notes: true,
  overlays: true,
  towers: true
};
const DEFAULT_MARKER_COLORS: MarkerColors = {
  deeds: "#facc15",
  notes: "#ff2bd6",
  towers: "#ffffff"
};
const DEFAULT_NOTE_CATEGORIES: NoteCategory[] = [
  { id: "default-category-general", name: "General" }
];

type ViewState = {
  x: number;
  y: number;
  zoom: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startZoom: number;
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

type DialogState =
  | { mode: "create"; markerType: MarkerType; x: number; y: number }
  | { marker: WorkspaceMarker; mode: "edit" };

type HoveredMarkerState = {
  marker: WorkspaceMarker;
  screenX: number;
  screenY: number;
};

type MapWorkspaceProps = {
  initialMarkers: WorkspaceMarker[];
  initialNoteCategories?: readonly NoteCategory[];
  map: WorkspaceMap | null;
  viewer: AccountViewer | null;
};

export default function MapWorkspace({
  initialMarkers,
  initialNoteCategories = DEFAULT_NOTE_CATEGORIES,
  map,
  viewer
}: MapWorkspaceProps) {
  const viewport = useViewportSize();
  const mapSize = getMapSize(map);
  const fittedView = useMemo(() => getFitView(viewport, mapSize), [mapSize, viewport]);
  const initialUrlCoordinate = useMemo(() => getInitialUrlCoordinate(map), [map]);
  const initialCoordinateView = useMemo(
    () => initialUrlCoordinate === null ? null : getCoordinateView(initialUrlCoordinate, viewport, mapSize),
    [initialUrlCoordinate, mapSize, viewport]
  );
  const [manualView, setManualView] = useState<ViewState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [localMarkers, setLocalMarkers] = useState<WorkspaceMarker[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [markerVisibility, setMarkerVisibility] = useState<MarkerVisibility>(DEFAULT_MARKER_VISIBILITY);
  const [markerColors, setMarkerColors] = useState<MarkerColors>(DEFAULT_MARKER_COLORS);
  const [hoveredMarker, setHoveredMarker] = useState<HoveredMarkerState | null>(null);
  const [noteCategories, setNoteCategories] = useState<NoteCategory[]>(
    Array.from(initialNoteCategories.length === 0 ? DEFAULT_NOTE_CATEGORIES : initialNoteCategories)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const view = manualView ?? initialCoordinateView ?? fittedView;
  const markers = localMarkers ?? initialMarkers;
  const searchTerm = searchQuery.trim().toLowerCase();
  const displayedMarkers = useMemo(
    () => searchTerm.length === 0
      ? markers
      : markers.filter((marker) => markerMatchesSearch(marker, searchTerm)),
    [markers, searchTerm]
  );
  const highlightedMarkerIds = useMemo(
    () => searchTerm.length === 0 ? new Set<string>() : new Set(displayedMarkers.map((marker) => marker.id)),
    [displayedMarkers, searchTerm.length]
  );
  const canViewMap = map !== null && viewer !== null && canReadMap({
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin
  });
  const canWriteMapMarkers = viewer !== null && canWriteMarkers({
    accessLevel: viewer.permissions,
    approvalStatus: viewer.approvalStatus,
    isAdmin: viewer.isAdmin
  });

  const updateMarkers = useCallback(
    (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => {
      setLocalMarkers((current) => updater(current ?? initialMarkers));
    },
    [initialMarkers]
  );
  const createNoteCategory = useCallback(async (name: string): Promise<NoteCategory | null> => {
    if (map === null) {
      return null;
    }

    const response = await fetch(`/api/maps/${map.id}/note-categories`, {
      body: JSON.stringify({ name }),
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
      setContextMenu(null);
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(view.zoom * factor, event.clientX, event.clientY);
    },
    [view.zoom, zoomAt]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || isInteractivePanTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setContextMenu(null);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: view.x,
        startY: view.y,
        startZoom: view.zoom
      };
      setIsDragging(true);
    },
    [view.x, view.y, view.zoom]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!canViewMap || map === null) {
        return;
      }

      const coordinate = getMapCoordinate(event.clientX, event.clientY, view);

      if (!isInsideMap(coordinate, map)) {
        return;
      }

      event.preventDefault();
      setContextMenu({
        mapX: coordinate.x,
        mapY: coordinate.y,
        mode: "map",
        screenX: event.clientX,
        screenY: event.clientY
      });
    },
    [canViewMap, map, view]
  );

  const handleMarkerContextMenu = useCallback(
    (marker: WorkspaceMarker, event: React.MouseEvent<HTMLElement>) => {
      if (!canWriteMapMarkers) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        mapX: marker.x,
        mapY: marker.y,
        markers: getVisibleMarkersAtCoordinate(displayedMarkers, markerVisibility, marker.x, marker.y),
        mode: "marker",
        screenX: event.clientX,
        screenY: event.clientY
      });
    },
    [canWriteMapMarkers, displayedMarkers, markerVisibility]
  );

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      setManualView({
        x: drag.startX + event.clientX - drag.startClientX,
        y: drag.startY + event.clientY - drag.startClientY,
        zoom: drag.startZoom
      });
    }

    function endDrag(event: PointerEvent) {
      const drag = dragRef.current;

      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = null;
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

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
    <main className="map-page" aria-label="Map workspace">
      {canViewMap && map !== null ? (
        <section
          aria-label="Map image area"
          className={isDragging ? "map-viewport is-dragging" : "map-viewport"}
          onDragStart={preventNativeDrag}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
        >
          <Image
            alt="Wurm Online map"
            className="map-image"
            draggable={false}
            height={map.heightPx}
            onDragStart={preventNativeDrag}
            priority
            src={map.imageSrc}
            style={imageStyle}
            unoptimized
            width={map.widthPx}
          />
          <div
            className="map-stage"
            data-testid="map-stage"
            data-zoom={formatZoom(view.zoom)}
            style={stageStyle}
          >
            <MarkerLayer
              highlightedMarkerIds={highlightedMarkerIds}
              markerColors={markerColors}
              markers={displayedMarkers}
              onContextMenu={handleMarkerContextMenu}
              onHoverEnd={() => setHoveredMarker(null)}
              onHoverMove={(marker, event) => {
                setHoveredMarker({
                  marker,
                  screenX: event.clientX,
                  screenY: event.clientY
                });
              }}
              visibility={markerVisibility}
            />
          </div>
        </section>
      ) : (
        <section className="map-locked" aria-label="Map access required" />
      )}
      {canViewMap ? (
        <SearchOverlay
          onSearchChange={setSearchQuery}
          value={searchQuery}
        />
      ) : null}
      {contextMenu !== null ? (
        contextMenu.mode === "map" ? (
          <MapContextMenu
            canWrite={canWriteMapMarkers}
            contextMenu={contextMenu}
            onCopyLink={() => {
              setContextMenu(null);
              void copyCoordinateLink({ x: contextMenu.mapX, y: contextMenu.mapY });
            }}
            onCreate={(markerType) => {
              setFormError(null);
              setDialog({
                markerType,
                mode: "create",
                x: contextMenu.mapX,
                y: contextMenu.mapY
              });
              setContextMenu(null);
            }}
          />
        ) : (
          <MarkerContextMenu
            contextMenu={contextMenu}
            onCreate={(markerType) => {
              setFormError(null);
              setDialog({
                markerType,
                mode: "create",
                x: contextMenu.mapX,
                y: contextMenu.mapY
              });
              setContextMenu(null);
            }}
            onDelete={(marker) => {
              setContextMenu(null);
              void deleteMarkerRequest(marker, updateMarkers, setDialog, setFormError);
            }}
            onEdit={(marker) => {
              setFormError(null);
              setDialog({ marker, mode: "edit" });
              setContextMenu(null);
            }}
          />
        )
      ) : null}
      {hoveredMarker !== null ? <MarkerHoverDetails hoveredMarker={hoveredMarker} /> : null}
      {dialog !== null && map !== null ? (
        <MarkerDialog
          dialog={dialog}
          error={formError}
          map={map}
          noteCategories={noteCategories}
          onNoteCategoryCreate={createNoteCategory}
          onClose={() => {
            setDialog(null);
            setFormError(null);
          }}
          onSubmit={(event) => void submitMarkerForm(event, dialog, map.id, updateMarkers, setDialog, setFormError)}
          viewerIsAdmin={viewer?.isAdmin ?? false}
        />
      ) : null}
      <div className="map-top-controls">
        <AccountOverlay viewer={viewer} />
        {canViewMap ? (
          <MapSettingsOverlay
            markerColors={markerColors}
            markerVisibility={markerVisibility}
            onMarkerColorsChange={setMarkerColors}
            onMarkerVisibilityChange={setMarkerVisibility}
          />
        ) : null}
      </div>
    </main>
  );
}

function MapContextMenu({
  canWrite,
  contextMenu,
  onCopyLink,
  onCreate
}: {
  canWrite: boolean;
  contextMenu: Extract<ContextMenuState, { mode: "map" }>;
  onCopyLink(): void;
  onCreate(markerType: MarkerType): void;
}) {
  return (
    <div
      aria-label="Map actions"
      className="map-context-menu"
      role="menu"
      style={{ left: `${contextMenu.screenX}px`, top: `${contextMenu.screenY}px` }}
    >
      <p>{contextMenu.mapX}, {contextMenu.mapY}</p>
      <button onClick={onCopyLink} role="menuitem" type="button">Copy Link</button>
      {canWrite ? (
        <>
          <button onClick={() => onCreate("tower")} role="menuitem" type="button">Tower</button>
          <button onClick={() => onCreate("deed")} role="menuitem" type="button">Deed</button>
          <button onClick={() => onCreate("note")} role="menuitem" type="button">Note</button>
        </>
      ) : null}
    </div>
  );
}

function SearchOverlay({
  onSearchChange,
  value
}: {
  onSearchChange(value: string): void;
  value: string;
}) {
  return (
    <div className="map-search">
      <label>
        <span>Search map</span>
        <input
          aria-label="Search map"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          type="search"
          value={value}
        />
      </label>
    </div>
  );
}

function MarkerContextMenu({
  contextMenu,
  onCreate,
  onDelete,
  onEdit
}: {
  contextMenu: Extract<ContextMenuState, { mode: "marker" }>;
  onCreate(markerType: MarkerType): void;
  onDelete(marker: WorkspaceMarker): void;
  onEdit(marker: WorkspaceMarker): void;
}) {
  const hasStack = contextMenu.markers.length > 1;
  const firstMarker = contextMenu.markers[0] ?? null;

  return (
    <div
      aria-label="Marker actions"
      className="map-context-menu"
      role="menu"
      style={{ left: `${contextMenu.screenX}px`, top: `${contextMenu.screenY}px` }}
    >
      {hasStack ? (
        <>
          <p>{contextMenu.markers.length} markers at {contextMenu.mapX}, {contextMenu.mapY}</p>
          <div className="map-context-marker-list">
            {contextMenu.markers.map((marker) => {
              const label = getMarkerAtCoordinateLabel(marker);

              return (
                <div className="map-context-marker-row" key={marker.id}>
                  <span>{label}</span>
                  <div>
                    <button onClick={() => onEdit(marker)} role="menuitem" type="button">
                      Edit {label}
                    </button>
                    <button onClick={() => onDelete(marker)} role="menuitem" type="button">
                      Delete {label}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : firstMarker !== null ? (
        <>
          <p>{getMarkerLabel(firstMarker)}</p>
          <button onClick={() => onEdit(firstMarker)} role="menuitem" type="button">
            Edit
          </button>
          <button onClick={() => onDelete(firstMarker)} role="menuitem" type="button">
            Delete
          </button>
        </>
      ) : null}
      <div className="map-context-menu-section">
        <p>Add at {contextMenu.mapX}, {contextMenu.mapY}</p>
        <button onClick={() => onCreate("tower")} role="menuitem" type="button">Tower</button>
        <button onClick={() => onCreate("deed")} role="menuitem" type="button">Deed</button>
        <button onClick={() => onCreate("note")} role="menuitem" type="button">Note</button>
      </div>
    </div>
  );
}

function MarkerDialog({
  dialog,
  error,
  map,
  noteCategories,
  onClose,
  onNoteCategoryCreate,
  onSubmit,
  viewerIsAdmin
}: {
  dialog: DialogState;
  error: string | null;
  map: WorkspaceMap;
  noteCategories: NoteCategory[];
  onClose(): void;
  onNoteCategoryCreate(name: string): Promise<NoteCategory | null>;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  viewerIsAdmin: boolean;
}) {
  const markerType = dialog.mode === "create" ? dialog.markerType : dialog.marker.type;
  const title = dialog.mode === "create" ? `Add ${getMarkerTypeTitle(markerType)}` : `Edit ${getMarkerTitle(dialog.marker)}`;
  const coordinate = dialog.mode === "create"
    ? { x: dialog.x, y: dialog.y }
    : { x: dialog.marker.x, y: dialog.marker.y };

  return (
    <section className="map-marker-dialog" role="dialog" aria-label={title}>
      <DialogHeader title={title} onClose={onClose} />
      <form className="map-marker-form" onSubmit={onSubmit}>
        <div className="map-position-fields">
          <label>
            <span>X</span>
            <input name="x" required type="number" defaultValue={coordinate.x} min={0} max={map.widthPx - 1} />
          </label>
          <label>
            <span>Y</span>
            <input name="y" required type="number" defaultValue={coordinate.y} min={0} max={map.heightPx - 1} />
          </label>
        </div>
        <MarkerFields
          dialog={dialog}
          markerType={markerType}
          noteCategories={noteCategories}
          onNoteCategoryCreate={onNoteCategoryCreate}
          viewerIsAdmin={viewerIsAdmin}
        />
        {error !== null ? <p className="map-auth-error">{error}</p> : null}
        <button className="map-dialog-primary" type="submit">Save</button>
      </form>
    </section>
  );
}

function MarkerHoverDetails({ hoveredMarker }: { hoveredMarker: HoveredMarkerState }) {
  const title = getMarkerHoverTitle(hoveredMarker.marker);

  return (
    <section
      aria-label={title}
      className="map-hover-details"
      role="tooltip"
      style={getHoverDetailsStyle(hoveredMarker.screenX, hoveredMarker.screenY)}
    >
      <strong>{title}</strong>
      <MarkerHoverDetailsList marker={hoveredMarker.marker} />
    </section>
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

function MarkerHoverDetailsList({ marker }: { marker: WorkspaceMarker }) {
  if (marker.type === "tower") {
    return (
      <dl className="map-hover-details-list">
        <div><dt>Position</dt><dd>{marker.x}, {marker.y}</dd></div>
        <div><dt>QL</dt><dd>{marker.ql}</dd></div>
        <div><dt>DMG</dt><dd>{marker.damage}</dd></div>
      </dl>
    );
  }

  if (marker.type === "deed") {
    return (
      <dl className="map-hover-details-list">
        <div><dt>Position</dt><dd>{marker.x}, {marker.y}</dd></div>
        <div><dt>Mayor</dt><dd>{marker.founder}</dd></div>
        <div><dt>Dimensions</dt><dd>{formatDeedDimensions(marker)}</dd></div>
      </dl>
    );
  }

  return (
    <dl className="map-hover-details-list">
      <div className="map-hover-note-text">{marker.text}</div>
    </dl>
  );
}

function MarkerFields({
  dialog,
  markerType,
  noteCategories,
  onNoteCategoryCreate,
  viewerIsAdmin
}: {
  dialog: DialogState;
  markerType: MarkerType;
  noteCategories: NoteCategory[];
  onNoteCategoryCreate(name: string): Promise<NoteCategory | null>;
  viewerIsAdmin: boolean;
}) {
  const marker = dialog.mode === "edit" ? dialog.marker : null;

  if (markerType === "tower") {
    const tower = marker?.type === "tower" ? marker : null;
    const creator = tower === null ? "" : `${tower.makerName} ${tower.makerNumber}`;

    return (
      <>
        <label><span>QL</span><input name="ql" required defaultValue={tower?.ql ?? "50.00"} /></label>
        <label><span>Damage</span><input name="damage" required defaultValue={tower?.damage ?? "0.00"} /></label>
        <label><span>Creator</span><input name="creator" required defaultValue={creator} /></label>
      </>
    );
  }

  if (markerType === "deed") {
    const deed = marker?.type === "deed" ? marker : null;
    return (
      <>
        <label><span>Name</span><input name="name" required defaultValue={deed?.name ?? ""} /></label>
        <label><span>Mayor</span><input name="founder" required defaultValue={deed?.founder ?? ""} /></label>
        <div className="map-position-fields">
          <label><span>North</span><input name="north" required type="number" min={0} defaultValue={deed?.north ?? 5} /></label>
          <label><span>West</span><input name="west" required type="number" min={0} defaultValue={deed?.west ?? 5} /></label>
          <label><span>East</span><input name="east" required type="number" min={0} defaultValue={deed?.east ?? 5} /></label>
          <label><span>South</span><input name="south" required type="number" min={0} defaultValue={deed?.south ?? 5} /></label>
        </div>
      </>
    );
  }

  return (
    <NoteFields
      marker={marker?.type === "note" ? marker : null}
      noteCategories={noteCategories}
      onNoteCategoryCreate={onNoteCategoryCreate}
      viewerIsAdmin={viewerIsAdmin}
    />
  );
}

function NoteFields({
  marker,
  noteCategories,
  onNoteCategoryCreate,
  viewerIsAdmin
}: {
  marker: Extract<WorkspaceMarker, { type: "note" }> | null;
  noteCategories: NoteCategory[];
  onNoteCategoryCreate(name: string): Promise<NoteCategory | null>;
  viewerIsAdmin: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState(
    marker?.category ?? noteCategories[0]?.name ?? "General"
  );
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

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
        {viewerIsAdmin ? (
          <button
            aria-label="Add note category"
            className="map-icon-button"
            onClick={() => setIsAddingCategory((current) => !current)}
            type="button"
          >
            +
          </button>
        ) : null}
      </div>
      {isAddingCategory ? (
        <div className="map-note-category-create">
          <label>
            <span>New category</span>
            <input
              name="new-category"
              onChange={(event) => setNewCategoryName(event.target.value)}
              value={newCategoryName}
            />
          </label>
          <button
            onClick={() => {
              void onNoteCategoryCreate(newCategoryName).then((category) => {
                if (category !== null) {
                  setSelectedCategory(category.name);
                  setNewCategoryName("");
                  setIsAddingCategory(false);
                }
              });
            }}
            type="button"
          >
            Save category
          </button>
        </div>
      ) : null}
      <label>
        <span>Text</span>
        <textarea name="text" required defaultValue={marker?.text ?? ""} />
      </label>
    </>
  );
}

async function submitMarkerForm(
  event: FormEvent<HTMLFormElement>,
  dialog: DialogState,
  mapId: string,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setDialog: (dialog: DialogState | null) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const markerType = dialog.mode === "create" ? dialog.markerType : dialog.marker.type;
  const payload = buildMarkerPayload(markerType, formData);
  const url = dialog.mode === "edit"
    ? `/api/markers/${dialog.marker.type}/${dialog.marker.id}`
    : `/api/maps/${mapId}/markers`;
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: dialog.mode === "edit" ? "PATCH" : "POST"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setFormError(body?.error ?? "Marker could not be saved");
    return;
  }

  const body = (await response.json()) as { marker: WorkspaceMarker };
  setMarkers((current) => upsertMarker(current, body.marker));
  setDialog(null);
  setFormError(null);
}

async function deleteMarkerRequest(
  marker: WorkspaceMarker,
  setMarkers: (updater: (markers: WorkspaceMarker[]) => WorkspaceMarker[]) => void,
  setDialog: (dialog: DialogState | null) => void,
  setFormError: (error: string | null) => void
): Promise<void> {
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

function buildMarkerPayload(markerType: MarkerType, formData: FormData) {
  const base = {
    type: markerType,
    x: Number(formData.get("x")),
    y: Number(formData.get("y"))
  };

  if (markerType === "tower") {
    const creator = parseCreatorInput(String(formData.get("creator") ?? ""));

    return {
      ...base,
      damage: String(formData.get("damage") ?? ""),
      makerName: creator.makerName,
      makerNumber: creator.makerNumber,
      ql: String(formData.get("ql") ?? "")
    };
  }

  if (markerType === "deed") {
    return {
      ...base,
      east: Number(formData.get("east")),
      founder: String(formData.get("founder") ?? ""),
      name: String(formData.get("name") ?? ""),
      north: Number(formData.get("north")),
      south: Number(formData.get("south")),
      west: Number(formData.get("west"))
    };
  }

  return {
    category: String(formData.get("category") ?? ""),
    ...base,
    title: String(formData.get("title") ?? ""),
    text: String(formData.get("text") ?? "")
  };
}

function upsertMarker(markers: WorkspaceMarker[], marker: WorkspaceMarker): WorkspaceMarker[] {
  const existingIndex = markers.findIndex((candidate) => candidate.id === marker.id);

  if (existingIndex === -1) {
    return [...markers, marker];
  }

  return markers.map((candidate, index) => (index === existingIndex ? marker : candidate));
}

function upsertNoteCategory(categories: NoteCategory[], category: NoteCategory): NoteCategory[] {
  const existing = categories.some((candidate) => candidate.name === category.name);

  if (existing) {
    return categories.map((candidate) => (candidate.name === category.name ? category : candidate));
  }

  return [...categories, category].sort((a, b) => a.name.localeCompare(b.name));
}

function parseCreatorInput(value: string): { makerName: string; makerNumber: string } {
  const trimmed = value.trim();
  const match = /^(.*\S)\s+(\d{3})$/.exec(trimmed);

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

function getMapSize(map: WorkspaceMap | null) {
  return {
    heightPx: map?.heightPx ?? FALLBACK_MAP_SIZE_PX,
    widthPx: map?.widthPx ?? FALLBACK_MAP_SIZE_PX
  };
}

function useViewportSize(): ViewportSize {
  const snapshot = useSyncExternalStore(
    subscribeToViewport,
    getViewportSnapshot,
    getServerViewportSnapshot
  );

  return useMemo(() => parseViewportSnapshot(snapshot), [snapshot]);
}

function subscribeToViewport(listener: () => void): () => void {
  window.addEventListener("resize", listener);

  return () => {
    window.removeEventListener("resize", listener);
  };
}

function getViewportSnapshot(): string {
  if (typeof window === "undefined") {
    return SERVER_VIEWPORT_SNAPSHOT;
  }

  return `${window.innerWidth}x${window.innerHeight}`;
}

function getServerViewportSnapshot(): string {
  return SERVER_VIEWPORT_SNAPSHOT;
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

function getInitialUrlCoordinate(map: WorkspaceMap | null): MapCoordinate | null {
  if (typeof window === "undefined" || map === null) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
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

function getVisibleMarkersAtCoordinate(
  markers: WorkspaceMarker[],
  visibility: MarkerVisibility,
  x: number,
  y: number
): WorkspaceMarker[] {
  return markers.filter((marker) => marker.x === x && marker.y === y && isMarkerVisible(marker, visibility));
}

function isMarkerVisible(marker: WorkspaceMarker, visibility: MarkerVisibility): boolean {
  if (marker.type === "tower") {
    return visibility.towers;
  }

  if (marker.type === "deed") {
    return visibility.deeds;
  }

  return visibility.notes;
}

function markerMatchesSearch(marker: WorkspaceMarker, searchTerm: string): boolean {
  return getMarkerSearchText(marker).toLowerCase().includes(searchTerm);
}

function getMarkerSearchText(marker: WorkspaceMarker): string {
  if (marker.type === "tower") {
    return [
      "tower",
      marker.makerName,
      marker.makerNumber,
      marker.ql,
      marker.damage,
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

  return [
    "note",
    marker.category,
    marker.title,
    marker.text,
    marker.x,
    marker.y
  ].join(" ");
}

async function copyCoordinateLink(coordinate: MapCoordinate): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.set("x", String(coordinate.x));
  url.searchParams.set("y", String(coordinate.y));

  if (navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(url.toString());
    return;
  }

  window.prompt("Copy map link", url.toString());
}

function preventNativeDrag(event: React.DragEvent<HTMLElement>): void {
  event.preventDefault();
}

function isInteractivePanTarget(target: EventTarget): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest("button, a, input, select, textarea, [role='menu'], [role='dialog']") !== null;
}

function getMarkerTitle(marker: WorkspaceMarker): string {
  if (marker.type === "tower") {
    return "Tower";
  }

  if (marker.type === "deed") {
    return "Deed";
  }

  return `Note ${marker.category} - ${marker.title}`;
}

function getMarkerHoverTitle(marker: WorkspaceMarker): string {
  if (marker.type === "tower") {
    return `Tower: ${marker.makerName} ${marker.makerNumber}`;
  }

  if (marker.type === "deed") {
    return `Deed: ${marker.name}`;
  }

  return `${marker.category} - ${marker.title}`;
}

function getMarkerLabel(marker: WorkspaceMarker): string {
  if (marker.type === "tower") {
    return `Tower ${marker.makerName} ${marker.makerNumber}`;
  }

  if (marker.type === "deed") {
    return `Deed ${marker.name}`;
  }

  return "Note";
}

function getMarkerAtCoordinateLabel(marker: WorkspaceMarker): string {
  if (marker.type === "note") {
    return `Note ${marker.category} - ${marker.title}`;
  }

  return getMarkerLabel(marker);
}

function formatDeedDimensions(marker: Extract<WorkspaceMarker, { type: "deed" }>): string {
  return `${marker.west + marker.east + 1}x${marker.north + marker.south + 1}`;
}

function getMarkerTypeTitle(markerType: MarkerType): string {
  if (markerType === "tower") {
    return "tower";
  }

  if (markerType === "deed") {
    return "deed";
  }

  return "note";
}

function getHoverDetailsStyle(screenX: number, screenY: number): CSSProperties {
  return {
    left: formatPixels(screenX + 14),
    top: formatPixels(screenY + 14)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatZoom(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function formatPixels(value: number): string {
  return `${Number(value.toFixed(2))}px`;
}
