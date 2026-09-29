"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE,
  NOTE_CATEGORY_MARKER_SHAPES,
  type NoteCategoryMarkerShape
} from "@/lib/domain/note-categories";
import { TILE_HIGHLIGHT_GROUPS } from "@/lib/domain/tile-highlighting";
import {
  parseUserMapSettings,
  type NoteCategoryColors,
  type NoteCategoryMarkerShapes,
  type NoteCategoryPipSizes,
  type UserMapSettings
} from "@/lib/map-settings/map-settings";
import type {
  MarkerColors,
  MarkerOpacities,
  MarkerVisibility,
  NoteCategory,
  TileHighlightSettings
} from "@/lib/markers/marker-types";
import { DialogHeader } from "./dialog-header";
import { jsonRequest } from "./map-helpers";

type MapSettingsOverlayProps = {
  isOpen: boolean;
  mapId: string;
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
  // Resolves once any debounced settings save has reached the server, so profile snapshots are current.
  onFlushPendingSettings?(): Promise<void>;
  onLoadSettings(settings: UserMapSettings): void;
  onMarkerColorsChange(colors: MarkerColors): void;
  onMarkerOpacitiesChange(opacities: MarkerOpacities): void;
  onMarkerVisibilityChange(visibility: MarkerVisibility): void;
  onNoteCategoryColorChange(categoryId: string, color: string | null): void;
  onNoteCategoryMarkerShapeChange(categoryId: string, markerShape: NoteCategoryMarkerShape): void;
  onNoteCategoryPipSizeChange(categoryId: string, pipSize: number): void;
  onNoteCategoryCreate(input: NoteCategoryFormInput): Promise<NoteCategoryMutationResult>;
  onNoteCategoryDelete(categoryId: string): Promise<boolean>;
  onNoteCategoryUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategoryMutationResult>;
  onOpenChange(isOpen: boolean): void;
  onResetSettings(): void;
  onRoadwayEditModeChange(enabled: boolean): void;
  onSearchLinesEnabledChange(enabled: boolean): void;
  onTileHighlightChange(settings: TileHighlightSettings): void;
};

type LayerCategoryId = "markers" | "misc" | "roadways";

type LayerRow = {
  color?: keyof MarkerColors;
  label: string;
  opacity?: keyof MarkerOpacities;
  visibility: keyof MarkerVisibility;
};

// A row whose visibility, colour and opacity all share one settings key.
function styledLayer<K extends keyof MarkerVisibility & keyof MarkerColors & keyof MarkerOpacities>(label: string, key: K): LayerRow {
  return { color: key, label, opacity: key, visibility: key };
}

const TOP_LAYER_ROWS: LayerRow[] = [
  { label: "Overlays", visibility: "overlays" },
  styledLayer("Unique Spawn Area", "wildernessOverlay"),
  { label: "Tower Names", visibility: "towerNames" },
  { label: "Deed Names", visibility: "deedNames" },
  styledLayer("Sector Grid", "sectorGrid"),
  styledLayer("Mission Grid", "missionGrid")
];

const LAYER_CATEGORIES: Array<{ id: LayerCategoryId; label: string; rows: LayerRow[] }> = [
  {
    id: "markers",
    label: "Markers",
    rows: [
      styledLayer("Annotations", "annotations"),
      styledLayer("Towers", "towers"),
      { label: "Planned Towers", visibility: "plannedTowers" },
      styledLayer("Deeds", "deeds"),
      { label: "Deed Perimeters", visibility: "deedPerimeters" },
      styledLayer("Notes", "notes")
    ]
  },
  {
    id: "roadways",
    label: "Roadways",
    rows: [
      styledLayer("Bridges", "bridges"),
      styledLayer("Canals", "canals"),
      styledLayer("Highways", "highways"),
      styledLayer("Tunnels", "tunnels")
    ]
  },
  {
    id: "misc",
    label: "Misc",
    rows: [
      { color: "rifts", label: "Rifts", opacity: "riftOverlays", visibility: "riftOverlays" },
      { color: "camps", label: "Camps", visibility: "camps" },
      { color: "minedoors", label: "Minedoors", visibility: "minedoors" },
      styledLayer("Locate Souls", "locateSouls")
    ]
  }
];

type NoteCategoryFormInput = {
  name: string;
};

// `error` carries the server's message when it sent one; the overlay falls back to a generic message.
export type NoteCategoryMutationResult =
  | { category: NoteCategory; ok: true }
  | { error: string | null; ok: false };

// Mirrors the server's category name limit (MAX_NAME_LENGTH in src/lib/domain/constants.ts).
const MAX_NOTE_CATEGORY_NAME_LENGTH = 80;

export function MapSettingsOverlay({
  isOpen,
  mapId,
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
  onFlushPendingSettings,
  onLoadSettings,
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
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

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

  const renderLayerRow = ({ color, label, opacity, visibility }: LayerRow) => (
    <LayerControlRow
      checked={markerVisibility[visibility]}
      colorLabel={color === undefined ? undefined : `${label} color`}
      colorValue={color === undefined ? undefined : markerColors[color]}
      key={label}
      label={label}
      opacityLabel={opacity === undefined ? undefined : `${label} opacity`}
      opacityValue={opacity === undefined ? undefined : markerOpacities[opacity]}
      onColorChange={color === undefined ? undefined : (value) => onMarkerColorsChange({ ...markerColors, [color]: value })}
      onOpacityChange={opacity === undefined ? undefined : (value) => onMarkerOpacitiesChange({ ...markerOpacities, [opacity]: value })}
      onToggle={() => onMarkerVisibilityChange({ ...markerVisibility, [visibility]: !markerVisibility[visibility] })}
    />
  );

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
          <DialogHeader closeLabel="Close settings" onClose={() => onOpenChange(false)} title="Settings" />
          <fieldset className="map-layer-controls">
            <legend>Map Layers</legend>
            {TOP_LAYER_ROWS.map(renderLayerRow)}
            <LayerControlRow
              checked={searchLinesEnabled}
              label="Search Lines"
              onToggle={() => onSearchLinesEnabledChange(!searchLinesEnabled)}
            />
            {LAYER_CATEGORIES.map(({ id, label, rows }) => (
              <Fragment key={id}>
                <LayerCategory
                  isExpanded={isLayerCategoryExpanded(id)}
                  label={label}
                  onToggle={() => toggleLayerCategory(id)}
                />
                {isLayerCategoryExpanded(id) ? rows.map(renderLayerRow) : null}
              </Fragment>
            ))}
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
          <ProfileSettings
            mapId={mapId}
            onFlushPendingSettings={onFlushPendingSettings}
            onLoadSettings={onLoadSettings}
          />
          <div className="map-settings-actions">
            <button
              className="map-settings-default"
              onClick={() => setIsConfirmingReset(true)}
              type="button"
            >
              Default
            </button>
          </div>
          {isConfirmingReset ? (
            <MapConfirmDialog
              confirmLabel="Revert"
                message="Revert all map settings to their defaults? Your current settings will be overwritten."
              title="Revert to defaults"
              onCancel={() => setIsConfirmingReset(false)}
              onConfirm={() => {
                setIsConfirmingReset(false);
                onResetSettings();
              }}
            />
          ) : null}
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

type MapSettingsProfileSummary = {
  name: string;
  slot: number;
  updatedAt: string;
};

const PROFILE_SLOTS = [0, 1, 2] as const;
const MAX_PROFILE_NAME_LENGTH = 40;

function MapConfirmDialog({
  confirmLabel,
  message,
  title,
  onCancel,
  onConfirm
}: {
  confirmLabel: string;
  message: string;
  title: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="map-confirm-backdrop" onClick={onCancel}>
      <section
        aria-label={title}
        className="map-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <strong className="map-confirm-title">{title}</strong>
        <p className="map-confirm-message">{message}</p>
        <div className="map-confirm-actions">
          <button className="map-confirm-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="map-confirm-confirm is-danger"
            onClick={onConfirm}
            ref={confirmButtonRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfileSettings({
  mapId,
  onFlushPendingSettings,
  onLoadSettings
}: {
  mapId: string;
  onFlushPendingSettings?(): Promise<void>;
  onLoadSettings(settings: UserMapSettings): void;
}) {
  const [profiles, setProfiles] = useState<MapSettingsProfileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<string[]>(["", "", ""]);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  // Bumped to re-run the profile list fetch after a save or rename.
  const [profilesVersion, setProfilesVersion] = useState(0);
  const profilesUrl = `/api/maps/${encodeURIComponent(mapId)}/settings/profiles`;

  useEffect(() => {
    let isCurrent = true;
    const showProfiles = (loadedProfiles: MapSettingsProfileSummary[], loadError: string | null) => {
      if (isCurrent) {
        setProfiles(loadedProfiles);
        setError(loadError);
      }
    };

    void (async () => {
      try {
        const response = await fetch(profilesUrl);

        if (!response.ok) {
          throw new Error("Profiles could not be loaded");
        }

        const body = (await response.json()) as { profiles?: MapSettingsProfileSummary[] };

        showProfiles(Array.isArray(body.profiles) ? body.profiles : [], null);
      } catch {
        showProfiles([], "Profiles could not be loaded");
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [profilesUrl, profilesVersion]);

  const refreshProfiles = () => setProfilesVersion((version) => version + 1);
  // Runs a profile request, showing `errorMessage` when it throws or reports failure by returning false.
  const runProfileAction = async (errorMessage: string, action: () => Promise<boolean>) => {
    try {
      if (!(await action())) {
        setError(errorMessage);
      }
    } catch {
      setError(errorMessage);
    }
  };

  const saveProfile = (slot: number, name: string) => {
    const trimmedName = name.trim().slice(0, MAX_PROFILE_NAME_LENGTH);

    return runProfileAction("Profile could not be saved", async () => {
      // The server snapshots the stored settings, so push any debounced change first.
      await onFlushPendingSettings?.();
      const response = await fetch(`${profilesUrl}/${slot}`, jsonRequest("PUT", trimmedName.length > 0 ? { name: trimmedName } : {}));

      if (!response.ok) {
        return false;
      }

      setDraftNames((currentNames) => currentNames.map((currentName, index) => (index === slot ? "" : currentName)));
      refreshProfiles();
      return true;
    });
  };

  const renameProfile = async (slot: number, name: string) => {
    const trimmedName = name.trim().slice(0, MAX_PROFILE_NAME_LENGTH);

    if (trimmedName.length === 0) {
      setEditingSlot(null);
      return;
    }

    await runProfileAction("Profile could not be renamed", async () => {
      const response = await fetch(`${profilesUrl}/${slot}`, jsonRequest("PATCH", { name: trimmedName }));

      if (!response.ok) {
        return false;
      }

      setEditingSlot(null);
      refreshProfiles();
      return true;
    });
  };

  const loadProfile = (slot: number) => runProfileAction("Profile could not be loaded", async () => {
    const response = await fetch(`${profilesUrl}/${slot}`);

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { profile?: { settings?: unknown } };

    if (body.profile === undefined) {
      return false;
    }

    onLoadSettings(parseUserMapSettings(body.profile.settings));
    setError(null);
    return true;
  });

  const setDraftName = (slot: number, name: string) => {
    setDraftNames((currentNames) => currentNames.map((currentName, index) => (index === slot ? name : currentName)));
  };

  return (
    <fieldset className="map-layer-controls map-profile-controls">
      <legend>Profiles</legend>
      {profiles === null ? <p className="map-profile-loading">Loading profiles...</p> : null}
      {PROFILE_SLOTS.map((slot) => {
        const profile = profiles?.find((entry) => entry.slot === slot) ?? null;
        const draftName = draftNames[slot] ?? "";

        return (
          <div className="map-profile-row" data-testid={`profile-slot-${slot}`} key={slot}>
            {profile === null ? (
              <>
                <input
                  aria-label={`Profile ${slot + 1} name`}
                  maxLength={MAX_PROFILE_NAME_LENGTH}
                  onChange={(event) => setDraftName(slot, event.target.value)}
                  placeholder={`Profile ${slot + 1}`}
                  value={draftName}
                />
                <button
                  aria-label={`Save profile to slot ${slot + 1}`}
                  className="map-profile-action"
                  onClick={() => void saveProfile(slot, draftName)}
                  type="button"
                >
                  Save
                </button>
              </>
            ) : editingSlot === slot ? (
              <form
                className="map-profile-rename-form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void renameProfile(slot, editingName);
                }}
              >
                <input
                  aria-label={`Profile ${slot + 1} name`}
                  maxLength={MAX_PROFILE_NAME_LENGTH}
                  onChange={(event) => setEditingName(event.target.value)}
                  value={editingName}
                />
                <button
                  aria-label={`Save profile ${slot + 1} name`}
                  className="map-profile-icon-button"
                  type="submit"
                >
                  ✓
                </button>
              </form>
            ) : (
              <>
                <span className="map-profile-name">{profile.name}</span>
                <button
                  aria-label={`Rename ${profile.name}`}
                  className="map-profile-icon-button"
                  onClick={() => {
                    setEditingSlot(slot);
                    setEditingName(profile.name);
                  }}
                  type="button"
                >
                  ✎
                </button>
                <button
                  aria-label={`Load ${profile.name}`}
                  className="map-profile-action"
                  onClick={() => void loadProfile(slot)}
                  type="button"
                >
                  Load
                </button>
                <button
                  aria-label={`Overwrite ${profile.name}`}
                  className="map-profile-action"
                  onClick={() => void saveProfile(slot, profile.name)}
                  type="button"
                >
                  Save
                </button>
              </>
            )}
          </div>
        );
      })}
      {error !== null ? <p className="map-profile-error" role="alert">{error}</p> : null}
    </fieldset>
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
  onCreate(input: NoteCategoryFormInput): Promise<NoteCategoryMutationResult>;
  onDelete(categoryId: string): Promise<boolean>;
  onMarkerShapeChange(categoryId: string, markerShape: NoteCategoryMarkerShape): void;
  onPipSizeChange(categoryId: string, pipSize: number): void;
  onUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategoryMutationResult>;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const handleUpdate = useCallback(async (categoryId: string, input: NoteCategoryFormInput) => {
    setCategoryError(null);
    const result = await onUpdate(categoryId, input);

    if (!result.ok) {
      setCategoryError(result.error ?? "Note category could not be saved");
    }

    return result;
  }, [onUpdate]);
  const handleDelete = useCallback(async (categoryId: string) => {
    setCategoryError(null);
    const deleted = await onDelete(categoryId);

    if (!deleted) {
      setCategoryError("Note category could not be deleted");
    }

    return deleted;
  }, [onDelete]);

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
              onDelete={handleDelete}
              onMarkerShapeChange={onMarkerShapeChange}
              onPipSizeChange={onPipSizeChange}
              onUpdate={handleUpdate}
            />
          ))}
          {viewerCanWrite ? (
            <div className="map-note-category-add">
              {isAdding ? (
                <form
                  className="map-note-category-add-form"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    setCategoryError(null);
                    void onCreate({
                      name: newCategoryName
                    }).then((result) => {
                      if (!result.ok) {
                        setCategoryError(result.error ?? "Note category could not be created");
                        return;
                      }

                      setNewCategoryName("");
                      setIsAdding(false);
                    });
                  }}
                >
                  <label>
                    <span>Name</span>
                    <input
                      aria-label="New note category name"
                      maxLength={MAX_NOTE_CATEGORY_NAME_LENGTH}
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
          {categoryError !== null ? <p className="map-note-category-error" role="alert">{categoryError}</p> : null}
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
  onUpdate(categoryId: string, input: NoteCategoryFormInput): Promise<NoteCategoryMutationResult>;
}) {
  const [name, setName] = useState(category.name);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
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
            maxLength={MAX_NOTE_CATEGORY_NAME_LENGTH}
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
            onClick={() => setIsConfirmingDelete(true)}
            type="button"
          >
            ×
          </button>
        ) : null}
        {isConfirmingDelete ? (
          <MapConfirmDialog
            confirmLabel="Delete"
            message={`Delete the ${category.name} note category? Notes in this category will move to General.`}
            title="Delete note category"
            onCancel={() => setIsConfirmingDelete(false)}
            onConfirm={() => {
              setIsConfirmingDelete(false);
              void onDelete(category.id);
            }}
          />
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
              <option key={shape} value={shape}>{shape.charAt(0).toUpperCase() + shape.slice(1)}</option>
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
