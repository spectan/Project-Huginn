"use client";

import { useState, type ChangeEvent } from "react";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  TileHighlightSettings
} from "@/lib/markers/marker-types";

type MapSettingsOverlayProps = {
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markerVisibility: MarkerVisibility;
  tileHighlight: TileHighlightSettings;
  onMarkerColorsChange(colors: MarkerColors): void;
  onMarkerOpacitiesChange(opacities: MarkerOpacities): void;
  onMarkerVisibilityChange(visibility: MarkerVisibility): void;
  onTileHighlightChange(settings: TileHighlightSettings): void;
};

export function MapSettingsOverlay({
  markerColors,
  markerOpacities,
  markerVisibility,
  tileHighlight,
  onMarkerColorsChange,
  onMarkerOpacitiesChange,
  onMarkerVisibilityChange,
  onTileHighlightChange
}: MapSettingsOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="map-settings">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Map settings"
        className="map-settings-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {isOpen ? (
        <section className="map-settings-panel" role="dialog" aria-label="Map settings">
          <div className="map-account-panel-header">
            <strong>Map settings</strong>
            <button
              aria-label="Close map settings"
              className="map-account-close"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              x
            </button>
          </div>
          <fieldset className="map-layer-controls">
            <legend>Map layers</legend>
            <LayerControlRow
              checked={markerVisibility.overlays}
              label="Overlays"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                overlays: !markerVisibility.overlays
              })}
            />
            <LayerControlRow
              checked={markerVisibility.towers}
              colorLabel="Towers color"
              colorValue={markerColors.towers}
              label="Towers"
              opacityLabel="Towers opacity"
              opacityValue={markerOpacities.towers}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, towers: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, towers: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                towers: !markerVisibility.towers
              })}
            />
            <LayerControlRow
              checked={markerVisibility.towerNames}
              label="Tower Names"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                towerNames: !markerVisibility.towerNames
              })}
            />
            <LayerControlRow
              checked={markerVisibility.deeds}
              colorLabel="Deeds color"
              colorValue={markerColors.deeds}
              label="Deeds"
              opacityLabel="Deeds opacity"
              opacityValue={markerOpacities.deeds}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, deeds: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, deeds: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                deeds: !markerVisibility.deeds
              })}
            />
            <LayerControlRow
              checked={markerVisibility.deedNames}
              label="Deed Names"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                deedNames: !markerVisibility.deedNames
              })}
            />
            <LayerControlRow
              checked={markerVisibility.deedPerimeters}
              label="Deed Perimeters"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                deedPerimeters: !markerVisibility.deedPerimeters
              })}
            />
            <LayerControlRow
              checked={markerVisibility.notes}
              colorLabel="Notes color"
              colorValue={markerColors.notes}
              label="Notes"
              opacityLabel="Notes opacity"
              opacityValue={markerOpacities.notes}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, notes: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, notes: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                notes: !markerVisibility.notes
              })}
            />
            <LayerControlRow
              checked={markerVisibility.camps}
              colorLabel="Camps color"
              colorValue={markerColors.camps}
              label="Camps"
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, camps: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                camps: !markerVisibility.camps
              })}
            />
            <LayerControlRow
              checked={markerVisibility.minedoors}
              colorLabel="Minedoors color"
              colorValue={markerColors.minedoors}
              label="Minedoors"
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, minedoors: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                minedoors: !markerVisibility.minedoors
              })}
            />
            <LayerControlRow
              checked={markerVisibility.bridges}
              colorLabel="Bridges color"
              colorValue={markerColors.bridges}
              label="Bridges"
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, bridges: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                bridges: !markerVisibility.bridges
              })}
            />
            <LayerControlRow
              checked={markerVisibility.canals}
              colorLabel="Canals color"
              colorValue={markerColors.canals}
              label="Canals"
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, canals: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                canals: !markerVisibility.canals
              })}
            />
            <LayerControlRow
              checked={markerVisibility.highways}
              colorLabel="Highways color"
              colorValue={markerColors.highways}
              label="Highways"
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, highways: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                highways: !markerVisibility.highways
              })}
            />
            <LayerControlRow
              checked={markerVisibility.highwayDetails}
              label="Highway Details"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                highwayDetails: !markerVisibility.highwayDetails
              })}
            />
            <LayerControlRow
              checked={markerVisibility.riftOverlays}
              label="Rift Overlays"
              opacityLabel="Rift Overlay opacity"
              opacityValue={markerOpacities.riftOverlays}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, riftOverlays: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                riftOverlays: !markerVisibility.riftOverlays
              })}
            />
            <LayerControlRow
              checked={markerVisibility.sectorGrid}
              colorLabel="Grid Overlay color"
              colorValue={markerColors.sectorGrid}
              label="Grid Overlay"
              opacityLabel="Grid Overlay opacity"
              opacityValue={markerOpacities.sectorGrid}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, sectorGrid: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, sectorGrid: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                sectorGrid: !markerVisibility.sectorGrid
              })}
            />
            <LayerControlRow
              checked={markerVisibility.missionGrid}
              colorLabel="Mission Grid color"
              colorValue={markerColors.missionGrid}
              label="Mission Grid"
              opacityLabel="Mission Grid opacity"
              opacityValue={markerOpacities.missionGrid}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, missionGrid: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, missionGrid: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                missionGrid: !markerVisibility.missionGrid
              })}
            />
            <LayerControlRow
              colorLabel="Tile highlight color"
              colorValue={tileHighlight.color}
              label="Tile Highlight"
              opacityLabel="Tile highlight opacity"
              opacityValue={tileHighlight.opacity}
              onColorChange={(value) => onTileHighlightChange({ ...tileHighlight, color: value })}
              onOpacityChange={(value) => onTileHighlightChange({ ...tileHighlight, opacity: value })}
            />
          </fieldset>
        </section>
      ) : null}
    </div>
  );
}

function LayerControlRow({
  checked,
  colorLabel,
  colorValue,
  label,
  opacityLabel,
  opacityValue,
  onColorChange,
  onOpacityChange,
  onToggle
}: {
  checked?: boolean;
  colorLabel?: string;
  colorValue?: string;
  label: string;
  opacityLabel?: string;
  opacityValue?: number;
  onColorChange?(value: string): void;
  onOpacityChange?(value: number): void;
  onToggle?(): void;
}) {
  return (
    <div className="map-layer-row">
      {checked !== undefined && onToggle !== undefined ? (
        <input aria-label={label} checked={checked} onChange={onToggle} type="checkbox" />
      ) : (
        <span aria-hidden="true" className="map-layer-checkbox-spacer" />
      )}
      <span>{label}</span>
      {colorValue !== undefined && colorLabel !== undefined && onColorChange !== undefined ? (
        <input
          aria-label={colorLabel}
          className="map-layer-color"
          onChange={(event: ChangeEvent<HTMLInputElement>) => onColorChange(event.target.value)}
          type="color"
          value={colorValue}
        />
      ) : (
        <span aria-hidden="true" className="map-layer-color-spacer" />
      )}
      {opacityValue !== undefined && opacityLabel !== undefined && onOpacityChange !== undefined ? (
        <input
          aria-label={opacityLabel}
          className="map-layer-opacity"
          max={100}
          min={0}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onOpacityChange(parseOpacity(event.target.value))}
          type="range"
          value={opacityValue}
        />
      ) : (
        <span aria-hidden="true" className="map-layer-opacity-spacer" />
      )}
    </div>
  );
}

function parseOpacity(value: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round(parsedValue)));
}
