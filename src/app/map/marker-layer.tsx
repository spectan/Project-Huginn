"use client";

import type { CSSProperties, MouseEvent } from "react";
import {
  TOWER_PLACEMENT_DISTANCE_TILES,
  TOWER_PROTECTION_DISTANCE_TILES
} from "@/lib/domain/constants";
import type { MarkerColors, MarkerVisibility, WorkspaceMarker } from "@/lib/markers/marker-types";

type MarkerLayerProps = {
  highlightedMarkerIds: Set<string>;
  markerColors: MarkerColors;
  markers: WorkspaceMarker[];
  onContextMenu(marker: WorkspaceMarker, event: MouseEvent<HTMLElement>): void;
  onHoverEnd(): void;
  onHoverMove(marker: WorkspaceMarker, event: MouseEvent<HTMLElement>): void;
  visibility: MarkerVisibility;
};

export function MarkerLayer({
  highlightedMarkerIds,
  markerColors,
  markers,
  onContextMenu,
  onHoverEnd,
  onHoverMove,
  visibility
}: MarkerLayerProps) {
  return (
    <div className="map-marker-layer" aria-label="Map markers">
      {markers.map((marker) => renderMarker(marker, highlightedMarkerIds, markerColors, onContextMenu, onHoverEnd, onHoverMove, visibility))}
    </div>
  );
}

function renderMarker(
  marker: WorkspaceMarker,
  highlightedMarkerIds: Set<string>,
  markerColors: MarkerColors,
  onContextMenu: (marker: WorkspaceMarker, event: MouseEvent<HTMLElement>) => void,
  onHoverEnd: () => void,
  onHoverMove: (marker: WorkspaceMarker, event: MouseEvent<HTMLElement>) => void,
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
              style={getOverlayStyle(marker.x, marker.y, TOWER_PLACEMENT_DISTANCE_TILES, markerColors.towers, 0.08)}
            />
            <span
              className="map-tower-zone map-tower-zone--protection"
              data-testid={`tower-protection-${marker.id}`}
              style={getOverlayStyle(marker.x, marker.y, TOWER_PROTECTION_DISTANCE_TILES, markerColors.towers, 0.22)}
            />
          </>
        ) : null}
        <button
          aria-label={`Tower by ${marker.makerName} ${marker.makerNumber} at ${marker.x}, ${marker.y}`}
          className={isHighlighted ? "map-marker map-marker--tower map-search-match" : "map-marker map-marker--tower"}
          data-testid={`tower-center-${marker.id}`}
          onContextMenu={(event) => onContextMenu(marker, event)}
          onMouseEnter={(event) => onHoverMove(marker, event)}
          onMouseLeave={onHoverEnd}
          onMouseMove={(event) => onHoverMove(marker, event)}
          style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.towers)}
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
      height: `${getDeedHeight(marker)}px`,
      left: `${marker.x - marker.west}px`,
      top: `${marker.y - marker.north}px`,
      width: `${getDeedWidth(marker)}px`
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
              style={{ ...deedOverlayStyle, backgroundColor: colorWithAlpha(markerColors.deeds, 0.4) }}
              type="button"
            />
            <span
              className={isHighlighted ? "map-deed-center map-deed-center--visual map-search-match" : "map-deed-center map-deed-center--visual"}
              data-testid={`deed-center-${marker.id}`}
              style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.deeds)}
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
            style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.deeds)}
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
      style={getColoredCenterTileStyle(marker.x, marker.y, markerColors.notes)}
      type="button"
    />
  );
}

function getCenterTileStyle(x: number, y: number): CSSProperties {
  return {
    height: "3px",
    left: `${x - 1}px`,
    top: `${y - 1}px`,
    width: "3px"
  };
}

function getColoredCenterTileStyle(x: number, y: number, color: string): CSSProperties {
  return {
    ...getCenterTileStyle(x, y),
    backgroundColor: color
  };
}

function getOverlayStyle(x: number, y: number, distance: number, color: string, alpha: number): CSSProperties {
  return {
    ...getSquareStyle(x, y, distance),
    backgroundColor: colorWithAlpha(color, alpha)
  };
}

function getSquareStyle(x: number, y: number, distance: number): CSSProperties {
  return {
    height: `${distance * 2 + 1}px`,
    left: `${x - distance}px`,
    top: `${y - distance}px`,
    width: `${distance * 2 + 1}px`
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

function getDeedWidth(marker: Extract<WorkspaceMarker, { type: "deed" }>): number {
  return marker.west + marker.east + 1;
}

function getDeedHeight(marker: Extract<WorkspaceMarker, { type: "deed" }>): number {
  return marker.north + marker.south + 1;
}
