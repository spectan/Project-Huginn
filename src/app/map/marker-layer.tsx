"use client";

import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import {
  RIFT_OVERLAY_DISTANCE_TILES,
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import {
  getLocateSoulOverlayGeometry,
  locateSoulOverlayIntersectsMap
} from "@/lib/domain/locate-soul";
import { formatTowerCreator } from "@/lib/domain/markers";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE
} from "@/lib/domain/note-categories";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  NoteCategory,
  WorkspaceMarker
} from "@/lib/markers/marker-types";
import type {
  NoteCategoryColors,
  NoteCategoryMarkerShapes,
  NoteCategoryPipSizes
} from "@/lib/map-settings/map-settings";

type MarkerLayerProps = {
  activeRelocatableMarkerId: string | null;
  highlightedMarkerIds: Set<string>;
  mapSize: { heightPx: number; widthPx: number };
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markers: WorkspaceMarker[];
  noteCategories: NoteCategory[];
  noteCategoryColors: NoteCategoryColors;
  noteCategoryMarkerShapes: NoteCategoryMarkerShapes;
  noteCategoryPipSizes: NoteCategoryPipSizes;
  onContextMenu(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
  onDeedOverlayPointerDown(marker: WorkspaceMarker, event: PointerEvent<Element>): void;
  onHoverEnd(): void;
  onHoverMove(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
  onMarkerPointerDown(marker: WorkspaceMarker, event: PointerEvent<Element>): void;
  roadwayEditMode: boolean;
  view: MarkerLayerView;
  visibility: MarkerVisibility;
};

type MarkerLayerView = {
  x: number;
  y: number;
  zoom: number;
};

export function MarkerLayer({
  activeRelocatableMarkerId,
  highlightedMarkerIds,
  mapSize,
  markerColors,
  markerOpacities,
  markers,
  noteCategories,
  noteCategoryColors,
  noteCategoryMarkerShapes,
  noteCategoryPipSizes,
  onContextMenu,
  onDeedOverlayPointerDown,
  onHoverEnd,
  onHoverMove,
  onMarkerPointerDown,
  roadwayEditMode,
  view,
  visibility
}: MarkerLayerProps) {
  return (
    <div className="map-marker-layer" aria-label="Map markers" data-testid="map-marker-layer">
      {markers.map((marker) => renderMarker(marker, activeRelocatableMarkerId, highlightedMarkerIds, mapSize, markerColors, markerOpacities, noteCategories, noteCategoryColors, noteCategoryMarkerShapes, noteCategoryPipSizes, onContextMenu, onDeedOverlayPointerDown, onHoverEnd, onHoverMove, onMarkerPointerDown, roadwayEditMode, view, visibility))}
    </div>
  );
}

function renderMarker(
  marker: WorkspaceMarker,
  activeRelocatableMarkerId: string | null,
  highlightedMarkerIds: Set<string>,
  mapSize: { heightPx: number; widthPx: number },
  markerColors: MarkerColors,
  markerOpacities: MarkerOpacities,
  noteCategories: NoteCategory[],
  noteCategoryColors: NoteCategoryColors,
  noteCategoryMarkerShapes: NoteCategoryMarkerShapes,
  noteCategoryPipSizes: NoteCategoryPipSizes,
  onContextMenu: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  onDeedOverlayPointerDown: (marker: WorkspaceMarker, event: PointerEvent<Element>) => void,
  onHoverEnd: () => void,
  onHoverMove: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  onMarkerPointerDown: (marker: WorkspaceMarker, event: PointerEvent<Element>) => void,
  roadwayEditMode: boolean,
  view: MarkerLayerView,
  visibility: MarkerVisibility
) {
  const isHighlighted = highlightedMarkerIds.has(marker.id);
  const isRelocatable = activeRelocatableMarkerId === marker.id;

  if (isPathMarker(marker)) {
    if (!isPathVisible(marker, visibility)) {
      return null;
    }

    const canUseActions = roadwayEditMode;

    return (
      <svg aria-label={`${getPathTypeLabel(marker.type)} path layer`} className="map-path-svg" key={marker.id}>
        <polyline
          aria-label={`${getPathTypeLabel(marker.type)} ${marker.name || "path"} from ${marker.x}, ${marker.y}`}
          className={getPathClassName(isHighlighted, true)}
          data-testid={`path-marker-${marker.id}`}
          fill="none"
          onContextMenu={canUseActions ? (event) => onContextMenu(marker, event) : undefined}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          opacity={getPathOpacity(marker.type, markerOpacities)}
          points={getPathSvgPoints(marker.points, marker.width, view)}
          role={canUseActions ? "button" : undefined}
          stroke={getPathColor(marker.type, markerColors)}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth={getPathStrokeWidth(marker.width, view)}
          tabIndex={canUseActions ? 0 : undefined}
        />
      </svg>
    );
  }

  if (marker.type === "tower") {
    if (!visibility.towers) {
      return null;
    }

    const towerColor = markerColors.towers;
    const towerOpacity = markerOpacities.towers;
    const isPlannedTower = marker.planned === true;

    if (isPlannedTower && !visibility.plannedTowers) {
      return null;
    }

    const protectionBorderStyles = getSquareEdgeStyles(
      marker.x,
      marker.y,
      TOWER_PROTECTION_DISTANCE_TILES,
      towerColor,
      towerOpacity,
      view,
      1,
      isPlannedTower
    );
    const placementBorderStyles = getSquareEdgeStyles(
      marker.x,
      marker.y,
      TOWER_PLACEMENT_DISTANCE_TILES,
      towerColor,
      towerOpacity,
      view,
      0.5
    );

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays ? (
          <>
            <span
              className="map-tower-zone map-tower-zone--placement"
              data-testid={`tower-placement-${marker.id}`}
              style={getTowerOverlayStyle(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, towerOpacity, view)}
            />
            <span
              className="map-tower-zone-edge map-tower-zone-edge--placement"
              data-testid={`tower-placement-border-top-${marker.id}`}
              style={placementBorderStyles.top}
            />
            <span
              className="map-tower-zone-edge map-tower-zone-edge--placement"
              data-testid={`tower-placement-border-bottom-${marker.id}`}
              style={placementBorderStyles.bottom}
            />
            <span
              className="map-tower-zone-edge map-tower-zone-edge--placement"
              data-testid={`tower-placement-border-left-${marker.id}`}
              style={placementBorderStyles.left}
            />
            <span
              className="map-tower-zone-edge map-tower-zone-edge--placement"
              data-testid={`tower-placement-border-right-${marker.id}`}
              style={placementBorderStyles.right}
            />
            <span
              className={isPlannedTower ? "map-tower-zone map-tower-zone--protection is-planned" : "map-tower-zone map-tower-zone--protection"}
              data-testid={`tower-protection-${marker.id}`}
              style={getTowerOverlayStyle(
                marker.x,
                marker.y,
                TOWER_PROTECTION_DISTANCE_TILES,
                towerOpacity,
                view,
                isPlannedTower,
                towerColor
              )}
            />
            <span
              className={getTowerProtectionEdgeClassName(isPlannedTower)}
              data-testid={`tower-protection-border-top-${marker.id}`}
              style={protectionBorderStyles.top}
            />
            <span
              className={getTowerProtectionEdgeClassName(isPlannedTower)}
              data-testid={`tower-protection-border-bottom-${marker.id}`}
              style={protectionBorderStyles.bottom}
            />
            <span
              className={getTowerProtectionEdgeClassName(isPlannedTower)}
              data-testid={`tower-protection-border-left-${marker.id}`}
              style={protectionBorderStyles.left}
            />
            <span
              className={getTowerProtectionEdgeClassName(isPlannedTower)}
              data-testid={`tower-protection-border-right-${marker.id}`}
              style={protectionBorderStyles.right}
            />
          </>
        ) : null}
        <button
          aria-label={`Tower by ${formatTowerCreator(marker)} at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--tower", isHighlighted, isRelocatable)}
          data-testid={`tower-center-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          onPointerDown={(event) => onMarkerPointerDown(marker, event)}
          style={getOpaqueCenterTileStyle(marker.x, marker.y, towerColor, view)}
          type="button"
        />
      </div>
    );
  }

  if (marker.type === "annotation") {
    if (!visibility.annotations) {
      return null;
    }

    return (
      <button
        aria-label={`Annotation ${marker.title} at ${marker.x}, ${marker.y}`}
        className={getMarkerClassName("map-marker map-marker--note map-marker--note-shape-triangle map-marker--annotation", isHighlighted, isRelocatable)}
        data-testid={`annotation-center-${marker.id}`}
        key={marker.id}
        onContextMenu={(event) => onContextMenu(marker, event)}
        onMouseEnter={(event) => onHoverMove(marker, event)}
        onMouseLeave={onHoverEnd}
        onMouseMove={(event) => onHoverMove(marker, event)}
        onPointerDown={(event) => onMarkerPointerDown(marker, event)}
        style={getAnnotationMarkerStyle(marker.x, marker.y, markerColors.annotations, view)}
        type="button"
      />
    );
  }

  if (marker.type === "deed") {
    if (!visibility.deeds) {
      return null;
    }

    const deedOverlayStyle = {
      ...getScreenRectStyle({
        height: getDeedHeight(marker),
        width: getDeedWidth(marker),
        x: marker.x - marker.west,
        y: marker.y - marker.north
      }, view)
    };
    const deedBorderStyles = getDeedBorderStyles(marker, markerColors.deeds, markerOpacities.deeds, view);
    const deedPerimeterStyles = getDeedPerimeterStyles(marker, markerColors.deeds, markerOpacities.deeds, view);

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays ? (
          <>
            <button
              aria-label={`Deed ${marker.name} at ${marker.x}, ${marker.y}`}
              className="map-deed-overlay"
              data-testid={`deed-overlay-${marker.id}`}
              onContextMenu={(event) => onContextMenu(marker, event)}
              onMouseEnter={(event) => onHoverMove(marker, event)}
              onMouseLeave={onHoverEnd}
              onMouseMove={(event) => onHoverMove(marker, event)}
              onPointerDown={(event) => onDeedOverlayPointerDown(marker, event)}
              style={{
                ...deedOverlayStyle,
                opacity: percentageToOpacity(markerOpacities.deeds)
              }}
              type="button"
            />
            <span
              className="map-deed-border"
              data-testid={`deed-border-top-${marker.id}`}
              style={deedBorderStyles.top}
            />
            <span
              className="map-deed-border"
              data-testid={`deed-border-bottom-${marker.id}`}
              style={deedBorderStyles.bottom}
            />
            <span
              className="map-deed-border"
              data-testid={`deed-border-left-${marker.id}`}
              style={deedBorderStyles.left}
            />
            <span
              className="map-deed-border"
              data-testid={`deed-border-right-${marker.id}`}
              style={deedBorderStyles.right}
            />
            {visibility.deedPerimeters ? (
              <>
                <span
                  className="map-deed-perimeter"
                  data-testid={`deed-perimeter-top-${marker.id}`}
                  style={deedPerimeterStyles.top}
                />
                <span
                  className="map-deed-perimeter"
                  data-testid={`deed-perimeter-bottom-${marker.id}`}
                  style={deedPerimeterStyles.bottom}
                />
                <span
                  className="map-deed-perimeter"
                  data-testid={`deed-perimeter-left-${marker.id}`}
                  style={deedPerimeterStyles.left}
                />
                <span
                  className="map-deed-perimeter"
                  data-testid={`deed-perimeter-right-${marker.id}`}
                  style={deedPerimeterStyles.right}
                />
              </>
            ) : null}
            <span
              className={getDeedCenterClassName("map-deed-center map-deed-center--visual", isHighlighted, isRelocatable)}
              data-testid={`deed-center-${marker.id}`}
              onContextMenu={isRelocatable ? (event) => onContextMenu(marker, event) : undefined}
              onMouseEnter={isRelocatable ? (event) => onHoverMove(marker, event) : undefined}
              onMouseLeave={isRelocatable ? onHoverEnd : undefined}
              onMouseMove={isRelocatable ? (event) => onHoverMove(marker, event) : undefined}
              onPointerDown={isRelocatable ? (event) => onMarkerPointerDown(marker, event) : undefined}
              style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.deeds, view)}
            />
          </>
        ) : (
          <button
            aria-label={`Deed ${marker.name} at ${marker.x}, ${marker.y}`}
            className={getDeedCenterClassName("map-deed-center map-deed-center--interactive", isHighlighted, isRelocatable)}
            data-testid={`deed-center-${marker.id}`}
            onContextMenu={(event) => onContextMenu(marker, event)}
            onMouseEnter={(event) => onHoverMove(marker, event)}
            onMouseLeave={onHoverEnd}
            onMouseMove={(event) => onHoverMove(marker, event)}
            onPointerDown={(event) => onMarkerPointerDown(marker, event)}
            style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.deeds, view)}
            type="button"
          />
        )}
      </div>
    );
  }

  if (marker.type === "rift") {
    const riftBorderStyles = getSquareEdgeStyles(
      marker.x,
      marker.y,
      RIFT_OVERLAY_DISTANCE_TILES,
      markerColors.rifts,
      markerOpacities.riftOverlays,
      view
    );

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays && visibility.riftOverlays ? (
          <>
            <span
              className="map-rift-overlay"
              data-testid={`rift-overlay-${marker.id}`}
              style={getOverlayStyle(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, markerOpacities.riftOverlays, view)}
            />
            <span
              className="map-rift-border"
              data-testid={`rift-overlay-border-top-${marker.id}`}
              style={riftBorderStyles.top}
            />
            <span
              className="map-rift-border"
              data-testid={`rift-overlay-border-bottom-${marker.id}`}
              style={riftBorderStyles.bottom}
            />
            <span
              className="map-rift-border"
              data-testid={`rift-overlay-border-left-${marker.id}`}
              style={riftBorderStyles.left}
            />
            <span
              className="map-rift-border"
              data-testid={`rift-overlay-border-right-${marker.id}`}
              style={riftBorderStyles.right}
            />
          </>
        ) : null}
        <button
          aria-label={`Rift at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--rift", isHighlighted, isRelocatable)}
          data-testid={`rift-marker-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          onPointerDown={(event) => onMarkerPointerDown(marker, event)}
          style={getRiftMarkerStyle(marker.x, marker.y, markerColors.rifts, view)}
          type="button"
        />
      </div>
    );
  }

  if (marker.type === "camp") {
    if (!visibility.camps) {
      return null;
    }

    return (
      <button
        aria-label={`Camp ${marker.campType} at ${marker.x}, ${marker.y}`}
        className={getMarkerClassName("map-marker map-marker--camp", isHighlighted, isRelocatable)}
        data-testid={`camp-marker-${marker.id}`}
        key={marker.id}
        onContextMenu={(event) => onContextMenu(marker, event)}
        onMouseEnter={(event) => onHoverMove(marker, event)}
        onMouseLeave={onHoverEnd}
        onMouseMove={(event) => onHoverMove(marker, event)}
        onPointerDown={(event) => onMarkerPointerDown(marker, event)}
        style={getCampMarkerStyle(marker.x, marker.y, markerColors.camps, view)}
        type="button"
      />
    );
  }

  if (marker.type === "minedoor") {
    if (!visibility.minedoors) {
      return null;
    }

    return (
      <button
        aria-label={`Minedoor at ${marker.x}, ${marker.y}`}
        className={getMarkerClassName("map-marker map-marker--minedoor", isHighlighted, isRelocatable)}
        data-testid={`minedoor-marker-${marker.id}`}
        key={marker.id}
        onContextMenu={(event) => onContextMenu(marker, event)}
        onMouseEnter={(event) => onHoverMove(marker, event)}
        onMouseLeave={onHoverEnd}
        onMouseMove={(event) => onHoverMove(marker, event)}
        onPointerDown={(event) => onMarkerPointerDown(marker, event)}
        style={getMinedoorMarkerStyle(marker.x, marker.y, markerColors.minedoors, view)}
        type="button"
      />
    );
  }

  if (marker.type === "locateSoul") {
    if (!visibility.locateSouls) {
      return null;
    }

    const geometry = getLocateSoulOverlayGeometry({
      casterFacing: marker.casterFacing,
      direction: marker.direction,
      distanceBand: marker.distanceBand,
      mapHeightPx: mapSize.heightPx,
      mapWidthPx: mapSize.widthPx
    });
    const locateSoulOverlayIntersects = locateSoulOverlayIntersectsMap({
      casterFacing: marker.casterFacing,
      direction: marker.direction,
      distanceBand: marker.distanceBand,
      mapHeightPx: mapSize.heightPx,
      mapWidthPx: mapSize.widthPx,
      x: marker.x,
      y: marker.y
    });
    const offMapLine = getLocateSoulOffMapLine(marker.x, marker.y, geometry.centerAngleDegrees, mapSize, view);
    const directionLine = getLocateSoulDirectionLine(marker.x, marker.y, geometry.centerAngleDegrees, view);

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays && locateSoulOverlayIntersects ? (
          <svg aria-hidden="true" className="map-locate-soul-overlay-svg">
            <path
              className="map-locate-soul-overlay"
              data-testid={`locate-soul-overlay-${marker.id}`}
              d={getLocateSoulOverlayPath(marker.x, marker.y, geometry, view)}
              fill={markerColors.locateSouls}
              fillRule="evenodd"
              opacity={percentageToOpacity(markerOpacities.locateSouls)}
            />
          </svg>
        ) : null}
        {visibility.overlays && !locateSoulOverlayIntersects && offMapLine !== null ? (
          <svg aria-hidden="true" className="map-locate-soul-overlay-svg">
            <line
              className="map-locate-soul-off-map"
              data-testid={`locate-soul-off-map-${marker.id}`}
              opacity={percentageToOpacity(markerOpacities.locateSouls)}
              stroke={markerColors.locateSouls}
              strokeDasharray="8 6"
              strokeWidth={Math.max(2, 3 * view.zoom)}
              x1={formatSvgNumber(offMapLine.x1)}
              x2={formatSvgNumber(offMapLine.x2)}
              y1={formatSvgNumber(offMapLine.y1)}
              y2={formatSvgNumber(offMapLine.y2)}
            />
          </svg>
        ) : null}
        <svg aria-hidden="true" className="map-locate-soul-direction-svg">
          <line
            className="map-locate-soul-direction"
            data-testid={`locate-soul-direction-${marker.id}`}
            opacity={1}
            stroke={markerColors.locateSouls}
            strokeWidth={Math.max(2, 2 * view.zoom)}
            x1={formatSvgNumber(directionLine.x1)}
            x2={formatSvgNumber(directionLine.x2)}
            y1={formatSvgNumber(directionLine.y1)}
            y2={formatSvgNumber(directionLine.y2)}
          />
        </svg>
        <button
          aria-label={`Locate Soul ${marker.targetName} at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--locate-soul", isHighlighted, isRelocatable)}
          data-testid={`locate-soul-marker-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          onPointerDown={(event) => onMarkerPointerDown(marker, event)}
          style={getLocateSoulMarkerStyle(marker.x, marker.y, markerColors.locateSouls, view)}
          type="button"
        />
      </div>
    );
  }

  if (!visibility.notes) {
    return null;
  }

  const noteCategory = getNoteCategory(marker.category, noteCategories);
  const noteColor = noteCategory === null ? markerColors.notes : noteCategoryColors[noteCategory.id] ?? markerColors.notes;
  const noteShape = noteCategory === null
    ? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE
    : noteCategoryMarkerShapes[noteCategory.id] ?? noteCategory.markerShape;
  const noteSize = noteCategory === null
    ? DEFAULT_NOTE_CATEGORY_PIP_SIZE
    : noteCategoryPipSizes[noteCategory.id] ?? noteCategory.pipSize;

  return (
    <button
      aria-label={`Note ${marker.category} - ${marker.title} at ${marker.x}, ${marker.y}`}
      className={getMarkerClassName(`map-marker map-marker--note map-marker--note-shape-${noteShape}`, isHighlighted, isRelocatable)}
      data-testid={`note-center-${marker.id}`}
      key={marker.id}
      onContextMenu={(event) => onContextMenu(marker, event)}
      onMouseEnter={(event) => onHoverMove(marker, event)}
      onMouseLeave={onHoverEnd}
      onMouseMove={(event) => onHoverMove(marker, event)}
      onPointerDown={(event) => onMarkerPointerDown(marker, event)}
      style={getNoteMarkerStyle(marker.x, marker.y, noteSize, noteColor, view)}
      type="button"
    />
  );
}

function getNoteCategory(categoryName: string, noteCategories: NoteCategory[]): NoteCategory | null {
  return noteCategories.find((category) => category.name === categoryName) ?? null;
}

function getMarkerClassName(baseClassName: string, isHighlighted: boolean, isRelocatable: boolean): string {
  return [
    baseClassName,
    isHighlighted ? "map-search-match" : "",
    isRelocatable ? "map-marker--relocatable" : ""
  ].filter(Boolean).join(" ");
}

function getDeedCenterClassName(baseClassName: string, isHighlighted: boolean, isRelocatable: boolean): string {
  return [
    baseClassName,
    isHighlighted ? "map-search-match" : "",
    isRelocatable ? "map-deed-center--relocatable" : ""
  ].filter(Boolean).join(" ");
}

function getCenterTileStyle(x: number, y: number, view: MarkerLayerView): CSSProperties {
  return getScreenRectStyle({
    height: 3,
    width: 3,
    x: x - 1,
    y: y - 1
  }, view);
}

function getSingleTileStyle(x: number, y: number, view: MarkerLayerView): CSSProperties {
  return getScreenRectStyle({
    height: 1,
    width: 1,
    x,
    y
  }, view);
}

type CampMarkerStyle = CSSProperties & {
  "--map-camp-color": string;
};

type RiftMarkerStyle = CSSProperties & {
  "--map-rift-color": string;
};

function getRiftMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): RiftMarkerStyle {
  return {
    ...getCenterTileStyle(x, y, view),
    "--map-rift-color": color
  };
}

function getCampMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): CampMarkerStyle {
  return {
    ...getCenterTileStyle(x, y, view),
    "--map-camp-color": color
  };
}

type LocateSoulMarkerStyle = CSSProperties & {
  "--map-locate-soul-color": string;
};

type MinedoorMarkerStyle = CSSProperties & {
  "--map-minedoor-color": string;
};

type NoteMarkerStyle = CSSProperties & {
  "--map-note-category-color": string;
};

type AnnotationMarkerStyle = CSSProperties & {
  "--map-note-category-color": string;
};

function getMinedoorMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): MinedoorMarkerStyle {
  return {
    ...getSingleTileStyle(x, y, view),
    "--map-minedoor-color": color
  };
}

function getLocateSoulMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): LocateSoulMarkerStyle {
  return {
    ...getScreenRectStyle({
      height: 9,
      width: 9,
      x: x - 4,
      y: y - 4
    }, view),
    "--map-locate-soul-color": color,
    opacity: 1
  };
}

function getAnnotationMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): AnnotationMarkerStyle {
  return {
    ...getCenterTileStyle(x, y, view),
    "--map-note-category-color": color,
    backgroundColor: color,
    opacity: 1
  };
}

function getNoteMarkerStyle(x: number, y: number, size: number, color: string, view: MarkerLayerView): NoteMarkerStyle {
  const normalizedSize = Math.min(10, Math.max(1, Math.round(size)));

  return {
    ...getScreenRectStyle({
      height: normalizedSize,
      width: normalizedSize,
      x: x + 0.5 - normalizedSize / 2,
      y: y + 0.5 - normalizedSize / 2
    }, view),
    "--map-note-category-color": color,
    backgroundColor: color,
    opacity: 1
  };
}

function isPathMarker(marker: WorkspaceMarker): marker is Extract<WorkspaceMarker, { type: "bridge" | "canal" | "highway" | "tunnel" }> {
  return marker.type === "bridge" || marker.type === "canal" || marker.type === "highway" || marker.type === "tunnel";
}

function isPathVisible(
  marker: Extract<WorkspaceMarker, { type: "bridge" | "canal" | "highway" | "tunnel" }>,
  visibility: MarkerVisibility
): boolean {
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

function getPathColor(type: "bridge" | "canal" | "highway" | "tunnel", markerColors: MarkerColors): string {
  if (type === "bridge") {
    return markerColors.bridges;
  }

  if (type === "canal") {
    return markerColors.canals;
  }

  if (type === "highway") {
    return markerColors.highways;
  }

  return markerColors.tunnels;
}

function getPathOpacity(type: "bridge" | "canal" | "highway" | "tunnel", markerOpacities: MarkerOpacities): number {
  if (type === "bridge") {
    return percentageToOpacity(markerOpacities.bridges);
  }

  if (type === "canal") {
    return percentageToOpacity(markerOpacities.canals);
  }

  if (type === "highway") {
    return percentageToOpacity(markerOpacities.highways);
  }

  return percentageToOpacity(markerOpacities.tunnels);
}

function getPathClassName(isHighlighted: boolean, canInteract: boolean): string {
  return [
    "map-path",
    isHighlighted ? "map-search-match" : "",
    canInteract ? "" : "map-path--passive"
  ].filter(Boolean).join(" ");
}

function getPathTypeLabel(type: "bridge" | "canal" | "highway" | "tunnel"): string {
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

function getPathSvgPoints(points: Array<{ x: number; y: number }>, width: number, view: MarkerLayerView): string {
  const offset = getPathCoordinateOffset(width);

  return points.map((point) => (
    `${formatSvgNumber(view.x + (point.x + offset) * view.zoom)},${formatSvgNumber(view.y + (point.y + offset) * view.zoom)}`
  )).join(" ");
}

function getPathCoordinateOffset(width: number): number {
  return Math.round(width) % 2 === 0 ? 1 : 0.5;
}

function getLocateSoulOverlayPath(
  x: number,
  y: number,
  geometry: ReturnType<typeof getLocateSoulOverlayGeometry>,
  view: MarkerLayerView
): string {
  const center = {
    x: view.x + (x + 0.5) * view.zoom,
    y: view.y + (y + 0.5) * view.zoom
  };
  const startAngle = geometry.centerAngleDegrees - geometry.spanDegrees / 2;
  const endAngle = geometry.centerAngleDegrees + geometry.spanDegrees / 2;
  const outerRadius = Math.max(0.5, geometry.maxDistanceTiles) * view.zoom;
  const innerRadius = geometry.minDistanceTiles * view.zoom;
  const outerStart = getPolarPoint(center, outerRadius, startAngle);
  const outerEnd = getPolarPoint(center, outerRadius, endAngle);
  const largeArcFlag = geometry.spanDegrees > 180 ? 1 : 0;

  if (innerRadius <= 0) {
    return [
      `M ${formatSvgNumber(center.x)},${formatSvgNumber(center.y)}`,
      `L ${formatSvgNumber(outerStart.x)},${formatSvgNumber(outerStart.y)}`,
      `A ${formatSvgNumber(outerRadius)},${formatSvgNumber(outerRadius)} 0 ${largeArcFlag} 1 ${formatSvgNumber(outerEnd.x)},${formatSvgNumber(outerEnd.y)}`,
      "Z"
    ].join(" ");
  }

  const innerStart = getPolarPoint(center, innerRadius, startAngle);
  const innerEnd = getPolarPoint(center, innerRadius, endAngle);

  return [
    `M ${formatSvgNumber(outerStart.x)},${formatSvgNumber(outerStart.y)}`,
    `A ${formatSvgNumber(outerRadius)},${formatSvgNumber(outerRadius)} 0 ${largeArcFlag} 1 ${formatSvgNumber(outerEnd.x)},${formatSvgNumber(outerEnd.y)}`,
    `L ${formatSvgNumber(innerEnd.x)},${formatSvgNumber(innerEnd.y)}`,
    `A ${formatSvgNumber(innerRadius)},${formatSvgNumber(innerRadius)} 0 ${largeArcFlag} 0 ${formatSvgNumber(innerStart.x)},${formatSvgNumber(innerStart.y)}`,
    "Z"
  ].join(" ");
}

function getPolarPoint(
  center: { x: number; y: number },
  radius: number,
  angleDegrees: number
): { x: number; y: number } {
  const radians = angleDegrees * (Math.PI / 180);

  return {
    x: center.x + Math.sin(radians) * radius,
    y: center.y - Math.cos(radians) * radius
  };
}

function getLocateSoulOffMapLine(
  x: number,
  y: number,
  angleDegrees: number,
  mapSize: { heightPx: number; widthPx: number },
  view: MarkerLayerView
): { x1: number; x2: number; y1: number; y2: number } | null {
  const center = { x: x + 0.5, y: y + 0.5 };
  const exitDistance = getRayMapExitDistance(center, angleDegrees, mapSize);

  if (exitDistance === null) {
    return null;
  }

  const exitPoint = getPolarPoint(center, exitDistance, angleDegrees);

  return {
    x1: view.x + center.x * view.zoom,
    x2: view.x + exitPoint.x * view.zoom,
    y1: view.y + center.y * view.zoom,
    y2: view.y + exitPoint.y * view.zoom
  };
}

function getRayMapExitDistance(
  center: { x: number; y: number },
  angleDegrees: number,
  mapSize: { heightPx: number; widthPx: number }
): number | null {
  const radians = angleDegrees * (Math.PI / 180);
  const direction = {
    x: Math.sin(radians),
    y: -Math.cos(radians)
  };
  const candidates = [
    getPositiveBoundaryDistance(center.x, direction.x, 0),
    getPositiveBoundaryDistance(center.x, direction.x, mapSize.widthPx),
    getPositiveBoundaryDistance(center.y, direction.y, 0),
    getPositiveBoundaryDistance(center.y, direction.y, mapSize.heightPx)
  ].filter((value): value is number => value !== null);

  const validCandidates = candidates.filter((distance) => {
    const point = getPolarPoint(center, distance, angleDegrees);
    return point.x >= 0 &&
      point.x <= mapSize.widthPx &&
      point.y >= 0 &&
      point.y <= mapSize.heightPx;
  });

  return validCandidates.length === 0 ? null : Math.min(...validCandidates);
}

function getPositiveBoundaryDistance(origin: number, direction: number, boundary: number): number | null {
  if (Math.abs(direction) < 0.000001) {
    return null;
  }

  const distance = (boundary - origin) / direction;
  return distance <= 0 ? null : distance;
}

function getLocateSoulDirectionLine(
  x: number,
  y: number,
  angleDegrees: number,
  view: MarkerLayerView
): { x1: number; x2: number; y1: number; y2: number } {
  const center = {
    x: view.x + (x + 0.5) * view.zoom,
    y: view.y + (y + 0.5) * view.zoom
  };
  const markerRadius = Math.max(5, 5 * view.zoom);
  const lineLength = Math.max(15, 20 * view.zoom);
  const start = getPolarPoint(center, markerRadius, angleDegrees);
  const end = getPolarPoint(center, markerRadius + lineLength, angleDegrees);

  return {
    x1: start.x,
    x2: end.x,
    y1: start.y,
    y2: end.y
  };
}

function getPathStrokeWidth(width: number, view: MarkerLayerView): number {
  return Math.max(1, width * view.zoom);
}

function formatSvgNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function getOpaqueCenterTileStyle(
  x: number,
  y: number,
  color: string,
  view: MarkerLayerView
): CSSProperties {
  return {
    ...getCenterTileStyle(x, y, view),
    backgroundColor: color,
    opacity: 1
  };
}

function getOverlayStyle(
  x: number,
  y: number,
  distance: number,
  opacity: number,
  view: MarkerLayerView
): CSSProperties {
  return {
    ...getSquareStyle(x, y, distance, view),
    opacity: percentageToOpacity(opacity)
  };
}

function getTowerOverlayStyle(
  x: number,
  y: number,
  distance: number,
  opacity: number,
  view: MarkerLayerView,
  isPlanned = false,
  color = "#ffffff"
): CSSProperties {
  return {
    ...getSquareStyle(x, y, distance, view),
    ...(isPlanned ? getPlannedTowerOverlayStripeStyle(color) : {}),
    opacity: percentageToOpacity(opacity)
  };
}

function getTowerProtectionEdgeClassName(isPlanned: boolean): string {
  return isPlanned
    ? "map-tower-zone-edge map-tower-zone-edge--protection is-planned"
    : "map-tower-zone-edge map-tower-zone-edge--protection";
}

function getSquareStyle(x: number, y: number, distance: number, view: MarkerLayerView): CSSProperties {
  return getScreenRectStyle({
    height: distance * 2 + 1,
    width: distance * 2 + 1,
    x: x - distance,
    y: y - distance
  }, view);
}

function getScreenRectStyle(
  rect: { height: number; width: number; x: number; y: number },
  view: MarkerLayerView
): CSSProperties {
  const left = view.x + rect.x * view.zoom;
  const top = view.y + rect.y * view.zoom;

  return {
    height: formatPixels(rect.height * view.zoom),
    left: formatPixels(left),
    top: formatPixels(top),
    width: formatPixels(rect.width * view.zoom)
  };
}

function percentageToOpacity(value: number): number {
  return Math.min(100, Math.max(0, value)) / 100;
}

function getDeedWidth(marker: Extract<WorkspaceMarker, { type: "deed" }>): number {
  return marker.west + marker.east + 1;
}

function getDeedHeight(marker: Extract<WorkspaceMarker, { type: "deed" }>): number {
  return marker.north + marker.south + 1;
}

function getDeedBorderStyles(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  color: string,
  opacity: number,
  view: MarkerLayerView
): Record<"bottom" | "left" | "right" | "top", CSSProperties> {
  return getRectEdgeStyles({
    color,
    height: getDeedHeight(marker),
    opacity,
    view,
    width: getDeedWidth(marker),
    x: marker.x - marker.west,
    y: marker.y - marker.north
  });
}

function getDeedPerimeterStyles(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  color: string,
  opacity: number,
  view: MarkerLayerView
): Record<"bottom" | "left" | "right" | "top", CSSProperties> {
  return getRectEdgeStyles({
    color,
    edgeThicknessTiles: 0.5,
    height: getDeedHeight(marker) + marker.perimeter * 2,
    opacity,
    view,
    width: getDeedWidth(marker) + marker.perimeter * 2,
    x: marker.x - marker.west - marker.perimeter,
    y: marker.y - marker.north - marker.perimeter
  });
}

function getSquareEdgeStyles(
  x: number,
  y: number,
  distance: number,
  color: string,
  opacity: number,
  view: MarkerLayerView,
  edgeThicknessTiles = 1,
  isPlanned = false
): Record<"bottom" | "left" | "right" | "top", CSSProperties> {
  const size = distance * 2 + 1;

  return getRectEdgeStyles({
    color,
    edgeThicknessTiles,
    height: size,
    opacity,
    view,
    width: size,
    x: x - distance,
    y: y - distance,
    ...(isPlanned ? { backgroundExtras: getPlannedTowerEdgeStripeStyle(color) } : {})
  });
}

function getRectEdgeStyles({
  backgroundExtras,
  color,
  edgeThicknessTiles = 1,
  height,
  opacity,
  view,
  width,
  x,
  y
}: {
  backgroundExtras?: CSSProperties;
  color: string;
  edgeThicknessTiles?: number;
  height: number;
  opacity: number;
  view: MarkerLayerView;
  width: number;
  x: number;
  y: number;
}): Record<"bottom" | "left" | "right" | "top", CSSProperties> {
  const edgeStyle = {
    ...backgroundExtras,
    backgroundColor: color,
    opacity: percentageToOpacity(opacity)
  };
  const edgeThickness = Math.min(1, Math.max(0.1, edgeThicknessTiles));
  const edgeInset = (1 - edgeThickness) / 2;
  const edgeLengthWidth = Math.max(edgeThickness, width - edgeInset * 2);
  const edgeLengthHeight = Math.max(edgeThickness, height - edgeInset * 2);

  return {
    bottom: {
      ...getScreenRectStyle({
        height: edgeThickness,
        width: edgeLengthWidth,
        x: x + edgeInset,
        y: y + height - 1 + edgeInset
      }, view),
      ...edgeStyle
    },
    left: {
      ...getScreenRectStyle({
        height: edgeLengthHeight,
        width: edgeThickness,
        x: x + edgeInset,
        y: y + edgeInset
      }, view),
      ...edgeStyle
    },
    right: {
      ...getScreenRectStyle({
        height: edgeLengthHeight,
        width: edgeThickness,
        x: x + width - 1 + edgeInset,
        y: y + edgeInset
      }, view),
      ...edgeStyle
    },
    top: {
      ...getScreenRectStyle({
        height: edgeThickness,
        width: edgeLengthWidth,
        x: x + edgeInset,
        y: y + edgeInset
      }, view),
      ...edgeStyle
    }
  };
}

function getPlannedTowerOverlayStripeStyle(color: string): CSSProperties {
  const stripeColor = getAlphaColor(color, 0.18);

  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${stripeColor} 0px, ${stripeColor} 8px, transparent 8px, transparent 16px)`
  };
}

function getPlannedTowerEdgeStripeStyle(color: string): CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0px, ${color} 8px, rgba(15, 23, 42, 0.72) 8px, rgba(15, 23, 42, 0.72) 16px)`
  };
}

function getAlphaColor(color: string, alpha: number): string {
  const trimmed = color.trim();
  const fullHex = trimmed.match(/^#([0-9a-f]{6})$/i);

  if (fullHex?.[1] !== undefined) {
    const value = fullHex[1];
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i);

  if (shortHex?.[1] !== undefined) {
    const value = shortHex[1];
    const redHex = value.slice(0, 1);
    const greenHex = value.slice(1, 2);
    const blueHex = value.slice(2, 3);
    const red = Number.parseInt(redHex + redHex, 16);
    const green = Number.parseInt(greenHex + greenHex, 16);
    const blue = Number.parseInt(blueHex + blueHex, 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return `rgba(255, 255, 255, ${alpha})`;
}

function formatPixels(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}
