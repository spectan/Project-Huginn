"use client";

import type { CSSProperties, MouseEvent } from "react";
import {
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
  onContextMenu(marker: WorkspaceMarker, event: MouseEvent<HTMLElement>): void;
  onHoverEnd(): void;
  onHoverMove(marker: WorkspaceMarker, event: MouseEvent<HTMLElement>): void;
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
  onContextMenu: (marker: WorkspaceMarker, event: MouseEvent<HTMLElement>) => void,
  onHoverEnd: () => void,
  onHoverMove: (marker: WorkspaceMarker, event: MouseEvent<HTMLElement>) => void,
  view: MarkerLayerView,
  visibility: MarkerVisibility
) {
  const isHighlighted = highlightedMarkerIds.has(marker.id);

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

function formatPixels(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}
