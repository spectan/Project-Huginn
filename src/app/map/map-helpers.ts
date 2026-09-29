import type { CSSProperties } from "react";
import type { MarkerType, PathWorkspaceMarker, WorkspaceMarker } from "@/lib/markers/marker-types";

export type ScreenView = { x: number; y: number; zoom: number };
export type PathMarkerType = PathWorkspaceMarker["type"];

export function formatPixels(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}

export function percentageToOpacity(value: number): number {
  return Math.min(100, Math.max(0, value)) / 100;
}

export function formatSvgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function isPathMarkerType(markerType: MarkerType): markerType is PathMarkerType {
  return markerType === "bridge" || markerType === "canal" || markerType === "highway" || markerType === "tunnel";
}

export function isPathMarker(marker: WorkspaceMarker): marker is PathWorkspaceMarker {
  return isPathMarkerType(marker.type);
}

export function getScreenRectStyle(
  rect: { height: number; width: number; x: number; y: number },
  view: ScreenView
): CSSProperties {
  return {
    height: formatPixels(rect.height * view.zoom),
    left: formatPixels(view.x + rect.x * view.zoom),
    top: formatPixels(view.y + rect.y * view.zoom),
    width: formatPixels(rect.width * view.zoom)
  };
}

export function getPathCoordinateOffset(width: number): number {
  return Math.round(width) % 2 === 0 ? 1 : 0.5;
}

export function getPathSvgPoints(points: Array<{ x: number; y: number }>, width: number, view: ScreenView): string {
  const offset = getPathCoordinateOffset(width);

  return points.map((point) => (
    `${formatSvgNumber(view.x + (point.x + offset) * view.zoom)},${formatSvgNumber(view.y + (point.y + offset) * view.zoom)}`
  )).join(" ");
}

export function jsonRequest(method: "PATCH" | "POST" | "PUT", body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method };
}
