"use client";

import type { ChangeEvent } from "react";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  TileHighlightSettings
} from "@/lib/markers/marker-types";

type MapSettingsOverlayProps = {
  isOpen: boolean;
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markerVisibility: MarkerVisibility;
  tileHighlight: TileHighlightSettings;
  onMarkerColorsChange(colors: MarkerColors): void;
  onMarkerOpacitiesChange(opacities: MarkerOpacities): void;
  onMarkerVisibilityChange(visibility: MarkerVisibility): void;
  onOpenChange(isOpen: boolean): void;
  onResetSettings(): void;
  onTileHighlightChange(settings: TileHighlightSettings): void;
};

export function MapSettingsOverlay({
  isOpen,
  markerColors,
  markerOpacities,
  markerVisibility,
  tileHighlight,
  onMarkerColorsChange,
  onMarkerOpacitiesChange,
  onMarkerVisibilityChange,
  onOpenChange,
  onResetSettings,
  onTileHighlightChange
}: MapSettingsOverlayProps) {
  return (
    <div className="map-settings">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Settings"
        className="map-settings-button"
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {isOpen ? (
        <section className="map-settings-panel" role="dialog" aria-label="Settings">
          <div className="map-account-panel-header">
            <strong>Settings</strong>
            <button
              aria-label="Close settings"
              className="map-account-close"
              onClick={() => onOpenChange(false)}
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
              opacityLabel="Bridges opacity"
              opacityValue={markerOpacities.bridges}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, bridges: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, bridges: value })}
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
              opacityLabel="Canals opacity"
              opacityValue={markerOpacities.canals}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, canals: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, canals: value })}
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
              opacityLabel="Highways opacity"
              opacityValue={markerOpacities.highways}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, highways: value })}
              onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, highways: value })}
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                highways: !markerVisibility.highways
              })}
            />
            <LayerControlRow
              checked={markerVisibility.riftOverlays}
              colorLabel="Rifts color"
              colorValue={markerColors.rifts}
              label="Rifts"
              opacityLabel="Rifts opacity"
              opacityValue={markerOpacities.riftOverlays}
              onColorChange={(value) => onMarkerColorsChange({ ...markerColors, rifts: value })}
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
          <div className="map-settings-actions">
            <button className="map-settings-default" onClick={onResetSettings} type="button">
              Default
            </button>
          </div>
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
      <span>{label}</span>
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
