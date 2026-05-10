"use client";

import { useState, type ChangeEvent } from "react";
import type { MarkerColors, MarkerVisibility } from "@/lib/markers/marker-types";

type MapSettingsOverlayProps = {
  markerColors: MarkerColors;
  markerVisibility: MarkerVisibility;
  onMarkerColorsChange(colors: MarkerColors): void;
  onMarkerVisibilityChange(visibility: MarkerVisibility): void;
};

export function MapSettingsOverlay({
  markerColors,
  markerVisibility,
  onMarkerColorsChange,
  onMarkerVisibilityChange
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
          <fieldset className="map-visibility-controls">
            <legend>Map visibility</legend>
            <VisibilityCheckbox
              checked={markerVisibility.overlays}
              label="Overlays"
              onChange={() => onMarkerVisibilityChange({
                ...markerVisibility,
                overlays: !markerVisibility.overlays
              })}
            />
            <VisibilityCheckbox
              checked={markerVisibility.towers}
              label="Towers"
              onChange={() => onMarkerVisibilityChange({
                ...markerVisibility,
                towers: !markerVisibility.towers
              })}
            />
            <VisibilityCheckbox
              checked={markerVisibility.deeds}
              label="Deeds"
              onChange={() => onMarkerVisibilityChange({
                ...markerVisibility,
                deeds: !markerVisibility.deeds
              })}
            />
            <VisibilityCheckbox
              checked={markerVisibility.notes}
              label="Notes"
              onChange={() => onMarkerVisibilityChange({
                ...markerVisibility,
                notes: !markerVisibility.notes
              })}
            />
          </fieldset>
          <fieldset className="map-color-controls">
            <legend>Marker colors</legend>
            <MarkerColorInput
              label="Tower color"
              value={markerColors.towers}
              onChange={(value) => onMarkerColorsChange({ ...markerColors, towers: value })}
            />
            <MarkerColorInput
              label="Deed color"
              value={markerColors.deeds}
              onChange={(value) => onMarkerColorsChange({ ...markerColors, deeds: value })}
            />
            <MarkerColorInput
              label="Note color"
              value={markerColors.notes}
              onChange={(value) => onMarkerColorsChange({ ...markerColors, notes: value })}
            />
          </fieldset>
        </section>
      ) : null}
    </div>
  );
}

function VisibilityCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange(): void;
}) {
  return (
    <label>
      <input checked={checked} onChange={onChange} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function MarkerColorInput({
  label,
  onChange,
  value
}: {
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </label>
  );
}
