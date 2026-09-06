import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
  DEFAULT_NOTE_CATEGORY_PIP_SIZE
} from "@/lib/domain/note-categories";
import {
  DEFAULT_USER_MAP_SETTINGS
} from "@/lib/map-settings/map-settings";
import type { NoteCategory } from "@/lib/markers/marker-types";
import { MapSettingsOverlay } from "./map-settings-overlay";

type OverlayProps = ComponentProps<typeof MapSettingsOverlay>;

type ProfileSummary = {
  name: string;
  slot: number;
  updatedAt: string;
};

const combatProfile: ProfileSummary = {
  name: "Combat",
  slot: 0,
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("MapSettingsOverlay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("confirms reverting to defaults with a themed dialog instead of the browser prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    stubProfileFetch();
    const { props } = renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    const dialog = screen.getByRole("alertdialog", { name: "Revert to defaults" });

    expect(dialog.className).toContain("map-confirm-dialog");
    expect(confirmSpy).not.toHaveBeenCalled();

    const revertButton = within(dialog).getByRole("button", { name: "Revert" });

    expect(revertButton.className).toContain("is-danger");
    expect(document.activeElement).toBe(revertButton);

    fireEvent.click(revertButton);

    expect(props.onResetSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancels the revert dialog without resetting settings", () => {
    stubProfileFetch();
    const { props } = renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onResetSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancels the revert dialog with the Escape key", () => {
    stubProfileFetch();
    const { props } = renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.getByRole("alertdialog", { name: "Revert to defaults" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onResetSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancels the revert dialog when the backdrop is clicked", () => {
    stubProfileFetch();
    const { container, props } = renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    const backdrop = container.querySelector(".map-confirm-backdrop");

    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as Element);

    expect(props.onResetSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirms note category deletion with the themed dialog instead of the browser prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    stubProfileFetch();
    const category: NoteCategory = {
      color: null,
      id: "cat-1",
      markerShape: DEFAULT_NOTE_CATEGORY_MARKER_SHAPE,
      name: "Hunting",
      pipSize: DEFAULT_NOTE_CATEGORY_PIP_SIZE
    };
    const { props } = renderOverlay({ noteCategories: [category], viewerIsAdmin: true });

    fireEvent.click(screen.getByRole("button", { name: "Note Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Hunting category" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete note category" });

    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(props.onNoteCategoryDelete).toHaveBeenCalledWith("cat-1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("loads the profile list and renders filled and empty slots", async () => {
    const fetchMock = stubProfileFetch({ profiles: [combatProfile] });
    renderOverlay();

    expect(await screen.findByText("Combat")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-celebration/settings/profiles");

    const filledRow = screen.getByTestId("profile-slot-0");

    expect(within(filledRow).getByRole("button", { name: "Load Combat" })).toBeTruthy();
    expect(within(filledRow).getByRole("button", { name: "Overwrite Combat" })).toBeTruthy();
    expect(within(filledRow).getByRole("button", { name: "Rename Combat" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Profile 2")).toBeTruthy();
    expect(screen.getByPlaceholderText("Profile 3")).toBeTruthy();
  });

  it("saves the current settings into an empty slot with the entered name", async () => {
    const fetchMock = stubProfileFetch();
    renderOverlay();

    const row = screen.getByTestId("profile-slot-1");

    fireEvent.change(within(row).getByLabelText("Profile 2 name"), { target: { value: "Hunting" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save profile to slot 2" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-celebration/settings/profiles/1", {
        body: JSON.stringify({ name: "Hunting" }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      })
    );
  });

  it("overwrites a filled slot with its current name", async () => {
    const fetchMock = stubProfileFetch({ profiles: [combatProfile] });
    renderOverlay();

    fireEvent.click(await screen.findByRole("button", { name: "Overwrite Combat" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-celebration/settings/profiles/0", {
        body: JSON.stringify({ name: "Combat" }),
        headers: { "content-type": "application/json" },
        method: "PUT"
      })
    );
  });

  it("renames a filled slot through the inline edit form", async () => {
    const fetchMock = stubProfileFetch({ profiles: [combatProfile] });
    renderOverlay();

    fireEvent.click(await screen.findByRole("button", { name: "Rename Combat" }));

    const row = screen.getByTestId("profile-slot-0");
    const nameInput = within(row).getByLabelText("Profile 1 name");

    expect(nameInput).toHaveProperty("value", "Combat");

    fireEvent.change(nameInput, { target: { value: "Raid night" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save profile 1 name" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-celebration/settings/profiles/0", {
        body: JSON.stringify({ name: "Raid night" }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    );
  });

  it("loads a slot and applies its settings through the callback", async () => {
    const profileSettings = {
      ...DEFAULT_USER_MAP_SETTINGS,
      markerVisibility: {
        ...DEFAULT_USER_MAP_SETTINGS.markerVisibility,
        towers: false
      },
      searchLinesEnabled: true
    };
    const fetchMock = stubProfileFetch({
      profiles: [combatProfile],
      slotSettings: { 0: profileSettings }
    });
    const { props } = renderOverlay();

    fireEvent.click(await screen.findByRole("button", { name: "Load Combat" }));

    await waitFor(() => expect(props.onLoadSettings).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-celebration/settings/profiles/0");
    expect(props.onLoadSettings).toHaveBeenCalledWith(expect.objectContaining({
      markerVisibility: expect.objectContaining({ towers: false }),
      searchLinesEnabled: true
    }));
  });
});

function renderOverlay(overrides: Partial<OverlayProps> = {}) {
  const props: OverlayProps = {
    isOpen: true,
    mapId: "map-celebration",
    markerColors: DEFAULT_USER_MAP_SETTINGS.markerColors,
    markerOpacities: DEFAULT_USER_MAP_SETTINGS.markerOpacities,
    markerVisibility: DEFAULT_USER_MAP_SETTINGS.markerVisibility,
    noteCategories: [],
    noteCategoryColors: {},
    noteCategoryMarkerShapes: {},
    noteCategoryPipSizes: {},
    roadwayEditMode: false,
    searchLinesEnabled: false,
    tileHighlight: DEFAULT_USER_MAP_SETTINGS.tileHighlight,
    viewerCanWrite: true,
    viewerIsAdmin: false,
    onLoadSettings: vi.fn(),
    onMarkerColorsChange: vi.fn(),
    onMarkerOpacitiesChange: vi.fn(),
    onMarkerVisibilityChange: vi.fn(),
    onNoteCategoryColorChange: vi.fn(),
    onNoteCategoryCreate: vi.fn(async () => null),
    onNoteCategoryDelete: vi.fn(async () => true),
    onNoteCategoryMarkerShapeChange: vi.fn(),
    onNoteCategoryPipSizeChange: vi.fn(),
    onNoteCategoryUpdate: vi.fn(async () => null),
    onOpenChange: vi.fn(),
    onResetSettings: vi.fn(),
    onRoadwayEditModeChange: vi.fn(),
    onSearchLinesEnabledChange: vi.fn(),
    onTileHighlightChange: vi.fn(),
    ...overrides
  };
  const result = render(<MapSettingsOverlay {...props} />);

  return { ...result, props };
}

function stubProfileFetch({
  profiles = [],
  slotSettings = {}
}: {
  profiles?: ProfileSummary[];
  slotSettings?: Record<number, unknown>;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const slotMatch = /\/settings\/profiles\/(\d+)$/.exec(url);

    if (slotMatch === null) {
      return jsonResponse({ profiles });
    }

    const slot = Number(slotMatch[1]);

    if (method === "GET") {
      const settings = slotSettings[slot];

      if (settings === undefined) {
        return jsonResponse({ error: "Profile not found" }, 404);
      }

      const profile = profiles.find((entry) => entry.slot === slot);

      return jsonResponse({
        profile: {
          name: profile?.name ?? `Profile ${slot + 1}`,
          settings,
          slot
        }
      });
    }

    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { name?: string }) : {};

    return jsonResponse(
      { profile: { name: body.name ?? `Profile ${slot + 1}`, settings: {}, slot } },
      method === "PUT" ? 201 : 200
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status
  } as unknown as Response;
}
