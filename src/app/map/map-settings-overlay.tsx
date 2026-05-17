"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import { TILE_HIGHLIGHT_GROUPS } from "@/lib/domain/tile-highlighting";
import type {
  NoteCategoryColors,
  NoteCategoryMarkerShapes,
  NoteCategoryPipSizes
} from "@/lib/map-settings/map-settings";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  NoteCategory,
  TileHighlightSettings
} from "@/lib/markers/marker-types";

type MapSettingsOverlayProps = {
  isOpen: boolean;
  markerColors: MarkerColors;
  markerOpacities: MarkerOpacities;
  markerVisibility: MarkerVisibility;
  noteCategories: NoteCategory[];
  noteCategoryColors: NoteCategoryColors;
  noteCategoryMarkerShapes: NoteCategoryMarkerShapes;
  noteCategoryPipSizes: NoteCategoryPipSizes;
  roadwayEditMode: boolean;
  searchLinesEnabled: boolean;
  tileHighlight: TileHighlightSettings;
  viewerCanWrite: boolean;
  viewerIsAdmin: boolean;
  onMarkerColorsChange(colors: MarkerColors): void;
  onMarkerOpacitiesChange(opacities: MarkerOpacities): void;
  onMarkerVisibilityChange(visibility: MarkerVisibility): void;
  onNoteCategoryColorChange(categoryId: string, color: string | null): void;
  onNoteCategoryMarkerShapeChange(categoryId: string, markerShape: NoteCategoryMarkerShape): void;
  onNoteCategoryPipSizeChange(categoryId: string, pipSize: number): void;
  onNoteCategoryCreate(input: NoteCategoryFormInput): Promise<NoteCategory | null>;
  onNoteCategoryDelete(categoryId: string): Promise<boolean>;
  onNoteCategoryUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategory | null>;
  onOpenChange(isOpen: boolean): void;
  onResetSettings(): void;
  onRoadwayEditModeChange(enabled: boolean): void;
  onSearchLinesEnabledChange(enabled: boolean): void;
  onTileHighlightChange(settings: TileHighlightSettings): void;
};

type LayerCategoryId = "markers" | "misc" | "roadways";

type NoteCategoryFormInput = {
  name: string;
};

export function MapSettingsOverlay({
  isOpen,
  markerColors,
  markerOpacities,
  markerVisibility,
  noteCategories,
  noteCategoryColors,
  noteCategoryMarkerShapes,
  noteCategoryPipSizes,
  roadwayEditMode,
  searchLinesEnabled,
  tileHighlight,
  viewerCanWrite,
  viewerIsAdmin,
  onMarkerColorsChange,
  onMarkerOpacitiesChange,
  onMarkerVisibilityChange,
  onNoteCategoryColorChange,
  onNoteCategoryMarkerShapeChange,
  onNoteCategoryPipSizeChange,
  onNoteCategoryCreate,
  onNoteCategoryDelete,
  onNoteCategoryUpdate,
  onOpenChange,
  onResetSettings,
  onRoadwayEditModeChange,
  onSearchLinesEnabledChange,
  onTileHighlightChange
}: MapSettingsOverlayProps) {
  const [expandedLayerCategories, setExpandedLayerCategories] = useState<Set<LayerCategoryId>>(() => new Set());

  const isLayerCategoryExpanded = (categoryId: LayerCategoryId) => expandedLayerCategories.has(categoryId);
  const toggleLayerCategory = (categoryId: LayerCategoryId) => {
    setExpandedLayerCategories((currentCategories) => {
      const nextCategories = new Set(currentCategories);

      if (nextCategories.has(categoryId)) {
        nextCategories.delete(categoryId);
      } else {
        nextCategories.add(categoryId);
      }

      return nextCategories;
    });
  };

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
            <legend>Map Layers</legend>
            <LayerControlRow
              checked={markerVisibility.overlays}
              label="Overlays"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                overlays: !markerVisibility.overlays
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
              checked={markerVisibility.deedNames}
              label="Deed Names"
              onToggle={() => onMarkerVisibilityChange({
                ...markerVisibility,
                deedNames: !markerVisibility.deedNames
              })}
            />
            <LayerControlRow
              checked={markerVisibility.sectorGrid}
              colorLabel="Sector Grid color"
              colorValue={markerColors.sectorGrid}
              label="Sector Grid"
              opacityLabel="Sector Grid opacity"
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
              checked={searchLinesEnabled}
              label="Search Lines"
              onToggle={() => onSearchLinesEnabledChange(!searchLinesEnabled)}
            />
            <LayerCategory
              isExpanded={isLayerCategoryExpanded("markers")}
              label="Markers"
              onToggle={() => toggleLayerCategory("markers")}
            />
            {isLayerCategoryExpanded("markers") ? (
              <>
                <LayerControlRow
                  checked={markerVisibility.annotations}
                  colorLabel="Annotations color"
                  colorValue={markerColors.annotations}
                  label="Annotations"
                  opacityLabel="Annotations opacity"
                  opacityValue={markerOpacities.annotations}
                  onColorChange={(value) => onMarkerColorsChange({ ...markerColors, annotations: value })}
                  onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, annotations: value })}
                  onToggle={() => onMarkerVisibilityChange({
                    ...markerVisibility,
                    annotations: !markerVisibility.annotations
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
                  checked={markerVisibility.plannedTowers}
                  label="Planned Towers"
                  onToggle={() => onMarkerVisibilityChange({
                    ...markerVisibility,
                    plannedTowers: !markerVisibility.plannedTowers
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
              </>
            ) : null}
            <LayerCategory
              isExpanded={isLayerCategoryExpanded("roadways")}
              label="Roadways"
              onToggle={() => toggleLayerCategory("roadways")}
            />
            {isLayerCategoryExpanded("roadways") ? (
              <>
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
                  checked={markerVisibility.tunnels}
                  colorLabel="Tunnels color"
                  colorValue={markerColors.tunnels}
                  label="Tunnels"
                  opacityLabel="Tunnels opacity"
                  opacityValue={markerOpacities.tunnels}
                  onColorChange={(value) => onMarkerColorsChange({ ...markerColors, tunnels: value })}
                  onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, tunnels: value })}
                  onToggle={() => onMarkerVisibilityChange({
                    ...markerVisibility,
                    tunnels: !markerVisibility.tunnels
                  })}
                />
              </>
            ) : null}
            <LayerCategory
              isExpanded={isLayerCategoryExpanded("misc")}
              label="Misc"
              onToggle={() => toggleLayerCategory("misc")}
            />
            {isLayerCategoryExpanded("misc") ? (
              <>
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
                  checked={markerVisibility.locateSouls}
                  colorLabel="Locate Souls color"
                  colorValue={markerColors.locateSouls}
                  label="Locate Souls"
                  opacityLabel="Locate Souls opacity"
                  opacityValue={markerOpacities.locateSouls}
                  onColorChange={(value) => onMarkerColorsChange({ ...markerColors, locateSouls: value })}
                  onOpacityChange={(value) => onMarkerOpacitiesChange({ ...markerOpacities, locateSouls: value })}
                  onToggle={() => onMarkerVisibilityChange({
                    ...markerVisibility,
                    locateSouls: !markerVisibility.locateSouls
                  })}
                />
              </>
            ) : null}
          </fieldset>
          <NoteCategorySettings
            markerColors={markerColors}
            noteCategories={noteCategories}
            noteCategoryColors={noteCategoryColors}
            noteCategoryMarkerShapes={noteCategoryMarkerShapes}
            noteCategoryPipSizes={noteCategoryPipSizes}
            viewerCanWrite={viewerCanWrite}
            viewerIsAdmin={viewerIsAdmin}
            onColorChange={onNoteCategoryColorChange}
            onCreate={onNoteCategoryCreate}
            onDelete={onNoteCategoryDelete}
            onMarkerShapeChange={onNoteCategoryMarkerShapeChange}
            onPipSizeChange={onNoteCategoryPipSizeChange}
            onUpdate={onNoteCategoryUpdate}
          />
          <div className="map-settings-tool-section">
            <fieldset className="map-layer-controls map-settings-tool-group">
              <legend>Tile Highlighting</legend>
              <LayerControlRow
                colorLabel="Tile highlight color"
                colorValue={tileHighlight.color}
                label="Tile Highlight"
                opacityLabel="Tile highlight opacity"
                opacityValue={tileHighlight.opacity}
                onColorChange={(value) => onTileHighlightChange({ ...tileHighlight, color: value })}
                onOpacityChange={(value) => onTileHighlightChange({ ...tileHighlight, opacity: value })}
              />
              <div className="map-layer-row map-settings-tool-row" data-layer-row="Tile Highlighting">
                <span aria-hidden="true" className="map-layer-checkbox-spacer" />
                <span aria-hidden="true" className="map-layer-color-spacer" />
                <span>Tile Highlighting</span>
                <select
                  aria-label="Tile Highlighting"
                  className="map-settings-tool-select"
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => onTileHighlightChange({
                    ...tileHighlight,
                    selection: event.target.value
                  })}
                  value={tileHighlight.selection}
                >
                  <option value="">None</option>
                  {TILE_HIGHLIGHT_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </fieldset>
            <fieldset className="map-layer-controls map-settings-tool-group">
              <legend>Roadway Edit Mode</legend>
              <LayerControlRow
                checked={roadwayEditMode}
                label="Roadway Edit Mode"
                onToggle={() => onRoadwayEditModeChange(!roadwayEditMode)}
              />
            </fieldset>
          </div>
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

function LayerCategory({
  isExpanded,
  label,
  onToggle
}: {
  isExpanded: boolean;
  label: string;
  onToggle(): void;
}) {
  return (
    <button
      aria-expanded={isExpanded}
      className="map-layer-category"
      data-layer-category={label}
      onClick={onToggle}
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="map-layer-category-icon">
        {isExpanded ? "v" : ">"}
      </span>
    </button>
  );
}

function NoteCategorySettings({
  markerColors,
  noteCategories,
  noteCategoryColors,
  noteCategoryMarkerShapes,
  noteCategoryPipSizes,
  viewerCanWrite,
  viewerIsAdmin,
  onColorChange,
  onCreate,
  onDelete,
  onMarkerShapeChange,
  onPipSizeChange,
  onUpdate
}: {
  markerColors: MarkerColors;
  noteCategories: NoteCategory[];
  noteCategoryColors: NoteCategoryColors;
  noteCategoryMarkerShapes: NoteCategoryMarkerShapes;
  noteCategoryPipSizes: NoteCategoryPipSizes;
  viewerCanWrite: boolean;
  viewerIsAdmin: boolean;
  onColorChange(categoryId: string, color: string | null): void;
  onCreate(input: NoteCategoryFormInput): Promise<NoteCategory | null>;
  onDelete(categoryId: string): Promise<boolean>;
  onMarkerShapeChange(categoryId: string, markerShape: NoteCategoryMarkerShape): void;
  onPipSizeChange(categoryId: string, pipSize: number): void;
  onUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategory | null>;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  return (
    <fieldset className="map-layer-controls map-note-category-controls">
      <legend className="map-sr-only">Note Categories</legend>
      <LayerCategory
        isExpanded={isExpanded}
        label="Note Categories"
        onToggle={() => setIsExpanded((current) => !current)}
      />
      {isExpanded ? (
        <>
          {noteCategories.map((category) => (
            <NoteCategoryRow
              category={category}
              inheritedColor={markerColors.notes}
              key={category.id}
              noteCategoryColor={noteCategoryColors[category.id]}
              noteCategoryMarkerShape={noteCategoryMarkerShapes[category.id]}
              noteCategoryPipSize={noteCategoryPipSizes[category.id]}
              viewerCanWrite={viewerCanWrite}
              viewerIsAdmin={viewerIsAdmin}
              onColorChange={onColorChange}
              onDelete={onDelete}
              onMarkerShapeChange={onMarkerShapeChange}
              onPipSizeChange={onPipSizeChange}
              onUpdate={onUpdate}
            />
          ))}
          {viewerCanWrite ? (
            <div className="map-note-category-add">
              {isAdding ? (
                <form
                  className="map-note-category-add-form"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void onCreate({
                      name: newCategoryName
                    }).then((category) => {
                      if (category !== null) {
                        setNewCategoryName("");
                        setIsAdding(false);
                      }
                    });
                  }}
                >
                  <label>
                    <span>Name</span>
                    <input
                      aria-label="New note category name"
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      value={newCategoryName}
                    />
                  </label>
                  <button aria-label="Create note category" type="submit">Create</button>
                </form>
              ) : (
                <button onClick={() => setIsAdding(true)} type="button">
                  Add note category
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}

function NoteCategoryRow({
  category,
  inheritedColor,
  noteCategoryColor,
  noteCategoryMarkerShape,
  noteCategoryPipSize,
  viewerCanWrite,
  viewerIsAdmin,
  onColorChange,
  onDelete,
  onMarkerShapeChange,
  onPipSizeChange,
  onUpdate
}: {
  category: NoteCategory;
  inheritedColor: string;
  noteCategoryColor: string | undefined;
  noteCategoryMarkerShape: NoteCategoryMarkerShape | undefined;
  noteCategoryPipSize: number | undefined;
  viewerCanWrite: boolean;
  viewerIsAdmin: boolean;
  onColorChange(categoryId: string, color: string | null): void;
  onDelete(categoryId: string): Promise<boolean>;
  onMarkerShapeChange(categoryId: string, markerShape: NoteCategoryMarkerShape): void;
  onPipSizeChange(categoryId: string, pipSize: number): void;
  onUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategory | null>;
}) {
  const [name, setName] = useState(category.name);
  const inheritsColor = noteCategoryColor === undefined;
  const color = noteCategoryColor ?? inheritedColor;
  const markerShape = noteCategoryMarkerShape ?? category.markerShape;
  const pipSize = noteCategoryPipSize ?? category.pipSize;

  return (
    <form
      className="map-note-category-settings-row"
      data-testid={`note-category-row-${category.id}`}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!viewerCanWrite) {
          return;
        }

        void onUpdate(category.id, {
          name
        });
      }}
    >
      <div className="map-note-category-settings-heading">
        <label className="map-note-category-color-field">
          <span>Color</span>
          <input
            aria-label={`${category.name} color`}
            className="map-layer-color"
            disabled={!viewerCanWrite || inheritsColor}
            onChange={(event) => {
              onColorChange(category.id, event.target.value);
            }}
            type="color"
            value={inheritsColor ? inheritedColor : color}
          />
        </label>
        <label>
          <span>Name</span>
          <input
            aria-label={`${category.name} name`}
            disabled={!viewerCanWrite}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        {viewerCanWrite ? (
          <button
            aria-label={`Save ${category.name} category`}
            className="map-note-category-icon-button"
            type="submit"
          >
            ✓
          </button>
        ) : null}
        {viewerIsAdmin && category.name !== "General" ? (
          <button
            aria-label={`Delete ${category.name} category`}
            className="map-note-category-delete map-note-category-icon-button"
            onClick={() => {
              if (window.confirm(`Delete the ${category.name} note category? Notes in this category will move to General.`)) {
                void onDelete(category.id);
              }
            }}
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="map-note-category-settings-options">
        <label className="map-note-category-inherit">
          <input
            aria-label={`${category.name} inherit Notes color`}
            checked={inheritsColor}
            disabled={!viewerCanWrite}
            onChange={() => {
              onColorChange(category.id, inheritsColor ? inheritedColor : null);
            }}
            type="checkbox"
          />
          <span>Inherit Notes color</span>
        </label>
        <label>
          <span>Size</span>
          <input
            aria-label={`${category.name} pip size`}
            disabled={!viewerCanWrite}
            max={10}
            min={1}
            onChange={(event) => onPipSizeChange(category.id, parsePipSize(event.target.value))}
            type="number"
            value={pipSize}
          />
        </label>
        <label>
          <span>Shape</span>
          <select
            aria-label={`${category.name} marker shape`}
            disabled={!viewerCanWrite}
            onChange={(event) => onMarkerShapeChange(category.id, parseNoteCategoryMarkerShape(event.target.value))}
            value={markerShape}
          >
            {NOTE_CATEGORY_MARKER_SHAPES.map((shape) => (
              <option key={shape} value={shape}>{formatNoteCategoryMarkerShape(shape)}</option>
            ))}
          </select>
        </label>
      </div>
    </form>
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
    <div className="map-layer-row" data-layer-row={label}>
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

function parsePipSize(value: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_NOTE_CATEGORY_PIP_SIZE;
  }

  return Math.min(10, Math.max(1, Math.round(parsedValue)));
}

function parseNoteCategoryMarkerShape(value: string): NoteCategoryMarkerShape {
  return NOTE_CATEGORY_MARKER_SHAPES.find((shape) => shape === value) ?? DEFAULT_NOTE_CATEGORY_MARKER_SHAPE;
}

function formatNoteCategoryMarkerShape(shape: NoteCategoryMarkerShape): string {
  if (shape === "x") {
    return "X";
  }

  if (shape === "o") {
    return "O";
  }

  return shape.charAt(0).toUpperCase() + shape.slice(1);
}
