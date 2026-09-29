"use client";

import React, { type CSSProperties, type MouseEvent, type PointerEvent } from "react";
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
  PathWorkspaceMarker,
  WorkspaceMarker
} from "@/lib/markers/marker-types";
import type {
  NoteCategoryColors,
  NoteCategoryMarkerShapes,
  NoteCategoryPipSizes
} from "@/lib/map-settings/map-settings";
import {
  formatSvgNumber,
  getPathSvgPoints,
  getScreenRectStyle,
  isPathMarker,
  percentageToOpacity,
  type ScreenView as MarkerLayerView
} from "./map-helpers";

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

type EdgeStyles = Record<"bottom" | "left" | "right" | "top", CSSProperties>;
type MarkerStyle = CSSProperties & Record<`--${string}`, string>;

const EDGES = ["top", "bottom", "left", "right"] as const;

export const MarkerLayer = React.memo(function MarkerLayer(props: MarkerLayerProps) {
  const { highlightedMarkerIds, markerColors, markerOpacities, markers, roadwayEditMode, view, visibility } = props;
  const pathMarkers: PathWorkspaceMarker[] = [];
  const nonPathMarkers: Exclude<WorkspaceMarker, PathWorkspaceMarker>[] = [];

  for (const marker of markers) {
    if (isPathMarker(marker)) {
      pathMarkers.push(marker);
    } else {
      nonPathMarkers.push(marker);
    }
  }

  return (
    <div className="map-marker-layer" aria-label="Map markers" data-testid="map-marker-layer">
      {nonPathMarkers.map((marker) => renderMarker(marker, props))}
      {pathMarkers.length > 0 ? (
        <svg aria-label="Roadway paths" className="map-path-svg" data-testid="map-paths-svg">
          {pathMarkers.map((marker) => {
            const layerKey = `${marker.type}s` as const;

            if (!visibility[layerKey]) {
              return null;
            }

            const canUseActions = roadwayEditMode;
            const handlers = getMarkerHandlers(marker, props);

            return (
              <polyline
                aria-label={`${marker.type.charAt(0).toUpperCase()}${marker.type.slice(1)} ${marker.name || "path"} from ${marker.x}, ${marker.y}`}
                className={getPathClassName(highlightedMarkerIds.has(marker.id), canUseActions)}
                data-testid={`path-marker-${marker.id}`}
                fill="none"
                key={marker.id}
                onContextMenu={canUseActions ? handlers.onContextMenu : undefined}
                onMouseEnter={handlers.onMouseEnter}
                onMouseLeave={handlers.onMouseLeave}
                onMouseMove={handlers.onMouseMove}
                opacity={percentageToOpacity(markerOpacities[layerKey])}
                points={getPathSvgPoints(marker.points, marker.width, view)}
                role={canUseActions ? "button" : undefined}
                stroke={markerColors[layerKey]}
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth={getPathStrokeWidth(marker.width, view)}
                tabIndex={canUseActions ? 0 : undefined}
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
});

function getMarkerHandlers(
  marker: WorkspaceMarker,
  { onContextMenu, onHoverEnd, onHoverMove, onMarkerPointerDown }: MarkerLayerProps
) {
  return {
    onContextMenu: (event: MouseEvent<Element>) => onContextMenu(marker, event),
    onMouseEnter: (event: MouseEvent<Element>) => onHoverMove(marker, event),
    onMouseLeave: onHoverEnd,
    onMouseMove: (event: MouseEvent<Element>) => onHoverMove(marker, event),
    onPointerDown: (event: PointerEvent<Element>) => onMarkerPointerDown(marker, event)
  };
}

function EdgeSpans({ className, id, styles, testIdPrefix }: { className: string; id: string; styles: EdgeStyles; testIdPrefix: string }) {
  return (
    <>
      {EDGES.map((edge) => (
        <span className={className} data-testid={`${testIdPrefix}-${edge}-${id}`} key={edge} style={styles[edge]} />
      ))}
    </>
  );
}

function renderMarker(marker: Exclude<WorkspaceMarker, PathWorkspaceMarker>, props: MarkerLayerProps) {
  const {
    activeRelocatableMarkerId,
    highlightedMarkerIds,
    mapSize,
    markerColors,
    markerOpacities,
    noteCategories,
    noteCategoryColors,
    noteCategoryMarkerShapes,
    noteCategoryPipSizes,
    onDeedOverlayPointerDown,
    view,
    visibility
  } = props;
  const isHighlighted = highlightedMarkerIds.has(marker.id);
  const isRelocatable = activeRelocatableMarkerId === marker.id;
  const handlers = getMarkerHandlers(marker, props);

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

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays ? (
          <>
            <span
              className="map-tower-zone map-tower-zone--placement"
              data-testid={`tower-placement-${marker.id}`}
              style={getTowerOverlayStyle(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, towerOpacity, view)}
            />
            <EdgeSpans
              className="map-tower-zone-edge map-tower-zone-edge--placement"
              id={marker.id}
              styles={getSquareEdgeStyles(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, towerColor, towerOpacity, view, 0.5)}
              testIdPrefix="tower-placement-border"
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
            <EdgeSpans
              className={isPlannedTower
                ? "map-tower-zone-edge map-tower-zone-edge--protection is-planned"
                : "map-tower-zone-edge map-tower-zone-edge--protection"}
              id={marker.id}
              styles={getSquareEdgeStyles(marker.x, marker.y, TOWER_PROTECTION_DISTANCE_TILES, towerColor, towerOpacity, view, 1, isPlannedTower)}
              testIdPrefix="tower-protection-border"
            />
          </>
        ) : null}
        <button
          aria-label={`Tower by ${formatTowerCreator(marker)} at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--tower", isHighlighted, isRelocatable)}
          data-testid={`tower-center-${marker.id}`}
          {...handlers}
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
        {...handlers}
        style={getNoteStyle(getCenterTileStyle(marker.x, marker.y, view), markerColors.annotations)}
        type="button"
      />
    );
  }

  if (marker.type === "deed") {
    if (!visibility.deeds) {
      return null;
    }

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays ? (
          <>
            <button
              aria-label={`Deed ${marker.name} at ${marker.x}, ${marker.y}`}
              className="map-deed-overlay"
              data-testid={`deed-overlay-${marker.id}`}
              {...handlers}
              onPointerDown={(event) => onDeedOverlayPointerDown(marker, event)}
              style={{
                ...getScreenRectStyle({
                  height: getDeedHeight(marker),
                  width: getDeedWidth(marker),
                  x: marker.x - marker.west,
                  y: marker.y - marker.north
                }, view),
                opacity: percentageToOpacity(markerOpacities.deeds)
              }}
              type="button"
            />
            <EdgeSpans
              className="map-deed-border"
              id={marker.id}
              styles={getDeedBorderStyles(marker, markerColors.deeds, markerOpacities.deeds, view)}
              testIdPrefix="deed-border"
            />
            {visibility.deedPerimeters ? (
              <EdgeSpans
                className="map-deed-perimeter"
                id={marker.id}
                styles={getDeedPerimeterStyles(marker, markerColors.deeds, markerOpacities.deeds, view)}
                testIdPrefix="deed-perimeter"
              />
            ) : null}
            <span
              className={getMarkerClassName("map-deed-center map-deed-center--visual", isHighlighted, isRelocatable, "map-deed-center--relocatable")}
              data-testid={`deed-center-${marker.id}`}
              {...(isRelocatable ? handlers : {})}
              style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.deeds, view)}
            />
          </>
        ) : (
          <button
            aria-label={`Deed ${marker.name} at ${marker.x}, ${marker.y}`}
            className={getMarkerClassName("map-deed-center map-deed-center--interactive", isHighlighted, isRelocatable, "map-deed-center--relocatable")}
            data-testid={`deed-center-${marker.id}`}
            {...handlers}
            style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.deeds, view)}
            type="button"
          />
        )}
      </div>
    );
  }

  if (marker.type === "rift") {
    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays && visibility.riftOverlays ? (
          <>
            <span
              className="map-rift-overlay"
              data-testid={`rift-overlay-${marker.id}`}
              style={{
                ...getSquareStyle(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, view),
                opacity: percentageToOpacity(markerOpacities.riftOverlays)
              }}
            />
            <EdgeSpans
              className="map-rift-border"
              id={marker.id}
              styles={getSquareEdgeStyles(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, markerColors.rifts, markerOpacities.riftOverlays, view)}
              testIdPrefix="rift-overlay-border"
            />
          </>
        ) : null}
        <button
          aria-label={`Rift at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--rift", isHighlighted, isRelocatable)}
          data-testid={`rift-marker-${marker.id}`}
          {...handlers}
          style={withColorVar(getCenterTileStyle(marker.x, marker.y, view), "--map-rift-color", markerColors.rifts)}
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
        {...handlers}
        style={withColorVar(getCenterTileStyle(marker.x, marker.y, view), "--map-camp-color", markerColors.camps)}
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
        {...handlers}
        style={withColorVar(getScreenRectStyle({ height: 1, width: 1, x: marker.x, y: marker.y }, view), "--map-minedoor-color", markerColors.minedoors)}
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
        <button
          aria-label={`Locate Soul ${marker.targetName} at ${marker.x}, ${marker.y}`}
          className={getMarkerClassName("map-marker map-marker--locate-soul", isHighlighted, isRelocatable)}
          data-testid={`locate-soul-marker-${marker.id}`}
          {...handlers}
          style={{
            ...withColorVar(getScreenRectStyle({ height: 9, width: 9, x: marker.x - 4, y: marker.y - 4 }, view), "--map-locate-soul-color", markerColors.locateSouls),
            opacity: 1
          }}
          type="button"
        />
      </div>
    );
  }

  if (!visibility.notes) {
    return null;
  }

  const noteCategory = noteCategories.find((category) => category.name === marker.category) ?? null;
  const noteColor = noteCategory === null ? markerColors.notes : noteCategoryColors[noteCategory.id] ?? markerColors.notes;
  const noteShape = noteCategory === null
    ? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE
    : noteCategoryMarkerShapes[noteCategory.id] ?? noteCategory.markerShape;
  const noteSize = noteCategory === null
    ? DEFAULT_NOTE_CATEGORY_PIP_SIZE
    : noteCategoryPipSizes[noteCategory.id] ?? noteCategory.pipSize;
  const normalizedSize = Math.min(10, Math.max(1, Math.round(noteSize)));

  return (
    <button
      aria-label={`Note ${marker.category} - ${marker.title} at ${marker.x}, ${marker.y}`}
      className={getMarkerClassName(`map-marker map-marker--note map-marker--note-shape-${noteShape}`, isHighlighted, isRelocatable)}
      data-testid={`note-center-${marker.id}`}
      key={marker.id}
      {...handlers}
      style={getNoteStyle(getScreenRectStyle({
        height: normalizedSize,
        width: normalizedSize,
        x: marker.x + 0.5 - normalizedSize / 2,
        y: marker.y + 0.5 - normalizedSize / 2
      }, view), noteColor)}
      type="button"
    />
  );
}

function getMarkerClassName(
  baseClassName: string,
  isHighlighted: boolean,
  isRelocatable: boolean,
  relocatableClassName = "map-marker--relocatable"
): string {
  return [
    baseClassName,
    isHighlighted ? "map-search-match" : "",
    isRelocatable ? relocatableClassName : ""
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

function withColorVar(base: CSSProperties, variable: `--${string}`, color: string): MarkerStyle {
  return { ...base, [variable]: color };
}

function getNoteStyle(base: CSSProperties, color: string): MarkerStyle {
  return {
    ...withColorVar(base, "--map-note-category-color", color),
    backgroundColor: color,
    opacity: 1
  };
}

function getPathClassName(isHighlighted: boolean, canInteract: boolean): string {
  return [
    "map-path",
    isHighlighted ? "map-search-match" : "",
    canInteract ? "" : "map-path--passive"
  ].filter(Boolean).join(" ");
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

function getPathStrokeWidth(width: number, view: MarkerLayerView): number {
  return Math.max(1, width * view.zoom);
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

function getSquareStyle(x: number, y: number, distance: number, view: MarkerLayerView): CSSProperties {
  return getScreenRectStyle({
    height: distance * 2 + 1,
    width: distance * 2 + 1,
    x: x - distance,
    y: y - distance
  }, view);
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
): EdgeStyles {
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
): EdgeStyles {
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
): EdgeStyles {
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
}): EdgeStyles {
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
