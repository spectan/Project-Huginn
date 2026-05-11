"use client";

import type { CSSProperties, MouseEvent } from "react";
import {
  RIFT_OVERLAY_DISTANCE_TILES,
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import { formatTowerCreator } from "@/lib/domain/markers";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  WorkspaceMarker
} from "@/lib/markers/marker-types";

type MarkerLayerProps = {
  highlightedMarkerIds: Set<string>;
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markers: WorkspaceMarker[];
  onContextMenu(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
  onHoverEnd(): void;
  onHoverMove(marker: WorkspaceMarker, event: MouseEvent<Element>): void;
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
  markerColors,
  markerOpacities,
  markers,
  onContextMenu,
  onHoverEnd,
  onHoverMove,
  view,
  visibility
}: MarkerLayerProps) {
  return (
    <div className="map-marker-layer" aria-label="Map markers" data-testid="map-marker-layer">
      {markers.map((marker) => renderMarker(marker, highlightedMarkerIds, markerColors, markerOpacities, onContextMenu, onHoverEnd, onHoverMove, view, visibility))}
    </div>
  );
}

function renderMarker(
  marker: WorkspaceMarker,
  highlightedMarkerIds: Set<string>,
  markerColors: MarkerColors,
  markerOpacities: MarkerOpacities,
  onContextMenu: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  onHoverEnd: () => void,
  onHoverMove: (marker: WorkspaceMarker, event: MouseEvent<Element>) => void,
  view: MarkerLayerView,
  visibility: MarkerVisibility
) {
  const isHighlighted = highlightedMarkerIds.has(marker.id);

  if (isPathMarker(marker)) {
    if (!isPathVisible(marker, visibility)) {
      return null;
    }

    const canInteract = marker.type !== "highway" || visibility.highwayDetails;

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
              style={getOverlayStyle(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, markerColors.towers, 0.08, markerOpacities.towers, view)}
            />
            <span
              className="map-tower-zone map-tower-zone--protection"
              data-testid={`tower-protection-${marker.id}`}
              style={getOverlayStyle(marker.x, marker.y, TOWER_PROTECTION_DISTANCE_TILES, markerColors.towers, 0.22, markerOpacities.towers, view)}
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
          style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.towers, markerOpacities.towers, view)}
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
                backgroundColor: colorWithAlpha(markerColors.deeds, 0.4),
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
              style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.deeds, markerOpacities.deeds, view)}
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
            style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.deeds, markerOpacities.deeds, view)}
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
            style={getOverlayStyle(marker.x, marker.y, RIFT_OVERLAY_DISTANCE_TILES, "#ef4444", 0.18, markerOpacities.riftOverlays, view)}
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
          style={getCenterTileStyle(marker.x, marker.y, view)}
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
      style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.notes, markerOpacities.notes, view)}
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

function getPathStrokeWidth(width: number, view: MarkerLayerView): number {
  return Math.max(1, width * view.zoom);
}

function formatSvgNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function getColoredCenterTileStyle(
  x: number,
  y: number,
  color: string,
  opacity: number,
  view: MarkerLayerView
): CSSProperties {
  return {
    ...getCenterTileStyle(x, y, view),
    backgroundColor: color,
    opacity: percentageToOpacity(opacity)
  };
}

function getOverlayStyle(
  x: number,
  y: number,
  distance: number,
  color: string,
  alpha: number,
  opacity: number,
  view: MarkerLayerView
): CSSProperties {
  return {
    ...getSquareStyle(x, y, distance, view),
    backgroundColor: colorWithAlpha(color, alpha),
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

function colorWithAlpha(color: string, alpha: number): string {
  const match = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/i.exec(color);

  if (match?.groups === undefined) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const red = Number.parseInt(match.groups.red ?? "ff", 16);
  const green = Number.parseInt(match.groups.green ?? "ff", 16);
  const blue = Number.parseInt(match.groups.blue ?? "ff", 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
    backgroundColor: colorWithAlpha(color, 0.9),
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
