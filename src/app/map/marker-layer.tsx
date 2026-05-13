"use client";

import type { CSSProperties, MouseEvent } from "react";
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
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  WorkspaceMarker
} from "@/lib/markers/marker-types";

type MarkerLayerProps = {
  highlightedMarkerIds: Set<string>;
  mapSize: { heightPx: number; widthPx: number };
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markers: WorkspaceMarker[];
  onContextMenu(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
  onHoverEnd(): void;
  onHoverMove(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
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
  highlightedMarkerIds,
  mapSize,
  markerColors,
  markerOpacities,
  markers,
  onContextMenu,
  onHoverEnd,
  onHoverMove,
  roadwayEditMode,
  view,
  visibility
}: MarkerLayerProps) {
  return (
    <div className="map-marker-layer" aria-label="Map markers" data-testid="map-marker-layer">
      {markers.map((marker) => renderMarker(marker, highlightedMarkerIds, mapSize, markerColors, markerOpacities, onContextMenu, onHoverEnd, onHoverMove, roadwayEditMode, view, visibility))}
    </div>
  );
}

function renderMarker(
  marker: WorkspaceMarker,
  highlightedMarkerIds: Set<string>,
  mapSize: { heightPx: number; widthPx: number },
  markerColors: MarkerColors,
  markerOpacities: MarkerOpacities,
  onContextMenu: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  onHoverEnd: () => void,
  onHoverMove: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  roadwayEditMode: boolean,
  view: MarkerLayerView,
  visibility: MarkerVisibility
) {
  const isHighlighted = highlightedMarkerIds.has(marker.id);

  if (isPathMarker(marker)) {
    if (!isPathVisible(marker, visibility)) {
      return null;
    }

    const canInteract = roadwayEditMode;

    return (
      <svg aria-label={`${getPathTypeLabel(marker.type)} path layer`} className="map-path-svg" key={marker.id}>
        <polyline
          aria-label={`${getPathTypeLabel(marker.type)} ${marker.name || "path"} from ${marker.x}, ${marker.y}`}
          className={getPathClassName(isHighlighted, canInteract)}
          data-testid={`path-marker-${marker.id}`}
          fill="none"
          onContextMenu={canInteract ? (event) => onContextMenu(marker, event) : undefined}
          onMouseEnter={canInteract ? (event) => onHoverMove(marker, event) : undefined}
          onMouseLeave={canInteract ? onHoverEnd : undefined}
          onMouseMove={canInteract ? (event) => onHoverMove(marker, event) : undefined}
          opacity={getPathOpacity(marker.type, markerOpacities)}
          points={getPathSvgPoints(marker.points, view)}
          role={canInteract ? "button" : undefined}
          stroke={getPathColor(marker.type, markerColors)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={getPathStrokeWidth(marker.width, view)}
          tabIndex={canInteract ? 0 : undefined}
        />
      </svg>
    );
  }

  if (marker.type === "tower") {
    if (!visibility.towers) {
      return null;
    }

    return (
      <div className="map-marker-group" key={marker.id}>
        {visibility.overlays ? (
          <>
            <span
              className="map-tower-zone map-tower-zone--placement"
              data-testid={`tower-placement-${marker.id}`}
              style={getOverlayStyle(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, markerColors.towers, markerOpacities.towers, view)}
            />
            <span
              className="map-tower-zone map-tower-zone--protection"
              data-testid={`tower-protection-${marker.id}`}
              style={getOverlayStyle(marker.x, marker.y, TOWER_PROTECTION_DISTANCE_TILES, markerColors.towers, markerOpacities.towers, view)}
            />
          </>
        ) : null}
        <button
          aria-label={`Tower by ${formatTowerCreator(marker)} at ${marker.x}, ${marker.y}`}
          className={isHighlighted ? "map-marker map-marker--tower map-search-match" : "map-marker map-marker--tower"}
          data-testid={`tower-center-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.towers, view)}
          type="button"
        />
      </div>
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
              style={{
                ...deedOverlayStyle,
                backgroundColor: markerColors.deeds,
                opacity: percentageToOpacity(markerOpacities.deeds)
              }}
              type="button"
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
              className={isHighlighted ? "map-deed-center map-deed-center--visual map-search-match" : "map-deed-center map-deed-center--visual"}
              data-testid={`deed-center-${marker.id}`}
              style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.deeds, view)}
            />
          </>
        ) : (
          <button
            aria-label={`Deed ${marker.name} at ${marker.x}, ${marker.y}`}
            className={isHighlighted ? "map-deed-center map-deed-center--interactive map-search-match" : "map-deed-center map-deed-center--interactive"}
            data-testid={`deed-center-${marker.id}`}
            onContextMenu={(event) => onContextMenu(marker, event)}
            onMouseEnter={(event) => onHoverMove(marker, event)}
            onMouseLeave={onHoverEnd}
            onMouseMove={(event) => onHoverMove(marker, event)}
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
          <span
            className="map-rift-overlay"
            data-testid={`rift-overlay-${marker.id}`}
            style={getOverlayStyle(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, markerColors.rifts, markerOpacities.riftOverlays, view)}
          />
        ) : null}
        <button
          aria-label={`Rift at ${marker.x}, ${marker.y}`}
          className={isHighlighted ? "map-marker map-marker--rift map-search-match" : "map-marker map-marker--rift"}
          data-testid={`rift-marker-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
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
        className={isHighlighted ? "map-marker map-marker--camp map-search-match" : "map-marker map-marker--camp"}
        data-testid={`camp-marker-${marker.id}`}
        key={marker.id}
        onContextMenu={(event) => onContextMenu(marker, event)}
        onMouseEnter={(event) => onHoverMove(marker, event)}
        onMouseLeave={onHoverEnd}
        onMouseMove={(event) => onHoverMove(marker, event)}
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
        className={isHighlighted ? "map-marker map-marker--minedoor map-search-match" : "map-marker map-marker--minedoor"}
        data-testid={`minedoor-marker-${marker.id}`}
        key={marker.id}
        onContextMenu={(event) => onContextMenu(marker, event)}
        onMouseEnter={(event) => onHoverMove(marker, event)}
        onMouseLeave={onHoverEnd}
        onMouseMove={(event) => onHoverMove(marker, event)}
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
          className={isHighlighted ? "map-marker map-marker--locate-soul map-search-match" : "map-marker map-marker--locate-soul"}
          data-testid={`locate-soul-marker-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.locateSouls, view)}
          type="button"
        />
      </div>
    );
  }

  if (!visibility.notes) {
    return null;
  }

  return (
    <button
      aria-label={`Note ${marker.category} - ${marker.title} at ${marker.x}, ${marker.y}`}
      className={isHighlighted ? "map-marker map-marker--note map-search-match" : "map-marker map-marker--note"}
      data-testid={`note-center-${marker.id}`}
      key={marker.id}
      onContextMenu={(event) => onContextMenu(marker, event)}
      onMouseEnter={(event) => onHoverMove(marker, event)}
      onMouseLeave={onHoverEnd}
      onMouseMove={(event) => onHoverMove(marker, event)}
      style={getOpaqueCenterTileStyle(marker.x, marker.y, markerColors.notes, view)}
      type="button"
    />
  );
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

type MinedoorMarkerStyle = CSSProperties & {
  "--map-minedoor-color": string;
};

function getMinedoorMarkerStyle(x: number, y: number, color: string, view: MarkerLayerView): MinedoorMarkerStyle {
  return {
    ...getSingleTileStyle(x, y, view),
    "--map-minedoor-color": color
  };
}

function isPathMarker(marker: WorkspaceMarker): marker is Extract<WorkspaceMarker, { type: "bridge" | "canal" | "highway" }> {
  return marker.type === "bridge" || marker.type === "canal" || marker.type === "highway";
}

function isPathVisible(
  marker: Extract<WorkspaceMarker, { type: "bridge" | "canal" | "highway" }>,
  visibility: MarkerVisibility
): boolean {
  if (marker.type === "bridge") {
    return visibility.bridges;
  }

  if (marker.type === "canal") {
    return visibility.canals;
  }

  return visibility.highways;
}

function getPathColor(type: "bridge" | "canal" | "highway", markerColors: MarkerColors): string {
  if (type === "bridge") {
    return markerColors.bridges;
  }

  if (type === "canal") {
    return markerColors.canals;
  }

  return markerColors.highways;
}

function getPathOpacity(type: "bridge" | "canal" | "highway", markerOpacities: MarkerOpacities): number {
  if (type === "bridge") {
    return percentageToOpacity(markerOpacities.bridges);
  }

  if (type === "canal") {
    return percentageToOpacity(markerOpacities.canals);
  }

  return percentageToOpacity(markerOpacities.highways);
}

function getPathClassName(isHighlighted: boolean, canInteract: boolean): string {
  return [
    "map-path",
    isHighlighted ? "map-search-match" : "",
    canInteract ? "" : "map-path--passive"
  ].filter(Boolean).join(" ");
}

function getPathTypeLabel(type: "bridge" | "canal" | "highway"): string {
  if (type === "bridge") {
    return "Bridge";
  }

  if (type === "canal") {
    return "Canal";
  }

  return "Highway";
}

function getPathSvgPoints(points: Array<{ x: number; y: number }>, view: MarkerLayerView): string {
  return points.map((point) => (
    `${formatSvgNumber(view.x + (point.x + 0.5) * view.zoom)},${formatSvgNumber(view.y + (point.y + 0.5) * view.zoom)}`
  )).join(" ");
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
  color: string,
  opacity: number,
  view: MarkerLayerView
): CSSProperties {
  return {
    ...getSquareStyle(x, y, distance, view),
    backgroundColor: color,
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

function getDeedPerimeterStyles(
  marker: Extract<WorkspaceMarker, { type: "deed" }>,
  color: string,
  opacity: number,
  view: MarkerLayerView
): Record<"bottom" | "left" | "right" | "top", CSSProperties> {
  const x = marker.x - marker.west - marker.perimeter;
  const y = marker.y - marker.north - marker.perimeter;
  const width = getDeedWidth(marker) + marker.perimeter * 2;
  const height = getDeedHeight(marker) + marker.perimeter * 2;
  const edgeStyle = {
    backgroundColor: color,
    opacity: percentageToOpacity(opacity)
  };

  return {
    bottom: {
      ...getScreenRectStyle({ height: 1, width, x, y: y + height - 1 }, view),
      ...edgeStyle
    },
    left: {
      ...getScreenRectStyle({ height, width: 1, x, y }, view),
      ...edgeStyle
    },
    right: {
      ...getScreenRectStyle({ height, width: 1, x: x + width - 1, y }, view),
      ...edgeStyle
    },
    top: {
      ...getScreenRectStyle({ height: 1, width, x, y }, view),
      ...edgeStyle
    }
  };
}

function formatPixels(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}
