import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_MAP_SETTINGS,
  mergeUserMapSettingsInput,
  parseUserMapSettings
} from "./map-settings";

describe("user map settings", () => {
  it("returns defaults for missing or invalid persisted settings", () => {
    expect(parseUserMapSettings(null)).toEqual(DEFAULT_USER_MAP_SETTINGS);
    expect(parseUserMapSettings("invalid")).toEqual(DEFAULT_USER_MAP_SETTINGS);
  });

  it("merges partial persisted settings over defaults", () => {
    expect(parseUserMapSettings({
      markerColors: {
        bridges: "#cc00cc",
        camps: "#ffcc00",
        canals: "#0055cc",
        highways: "#cccc00",
        minedoors: "#00ffff",
        towers: "#00ff00"
      },
      markerVisibility: {
        bridges: false,
        camps: false,
        canals: false,
        deedPerimeters: false,
        deedNames: true,
        highways: false,
        highwayDetails: true,
        minedoors: false,
        riftOverlays: false
      },
      tileHighlight: {
        selection: "Clay"
      }
    })).toEqual({
      ...DEFAULT_USER_MAP_SETTINGS,
      markerColors: {
        ...DEFAULT_USER_MAP_SETTINGS.markerColors,
        bridges: "#cc00cc",
        camps: "#ffcc00",
        canals: "#0055cc",
        highways: "#cccc00",
        minedoors: "#00ffff",
        towers: "#00ff00"
      },
      markerVisibility: {
        ...DEFAULT_USER_MAP_SETTINGS.markerVisibility,
        bridges: false,
        camps: false,
        canals: false,
        deedPerimeters: false,
        deedNames: true,
        highways: false,
        highwayDetails: true,
        minedoors: false,
        riftOverlays: false
      },
      tileHighlight: {
        ...DEFAULT_USER_MAP_SETTINGS.tileHighlight,
        selection: "Clay"
      }
    });
  });

  it("sanitizes invalid colors, opacities, and tile selections", () => {
    expect(parseUserMapSettings({
      markerColors: {
        bridges: "#CC00CC",
        camps: "#FEDCBA",
        canals: "#0055CC",
        deeds: "gold",
        highways: "yellow",
        minedoors: "cyan",
        notes: "#ABCDEF"
      },
      markerOpacities: {
        deeds: -10,
        notes: 150,
        riftOverlays: 37.2,
        towers: 44.6
      },
      tileHighlight: {
        color: "#12xz45",
        opacity: 52.2,
        selection: "Unknown"
      }
    })).toMatchObject({
      markerColors: {
        bridges: "#cc00cc",
        camps: "#fedcba",
        canals: "#0055cc",
        deeds: DEFAULT_USER_MAP_SETTINGS.markerColors.deeds,
        highways: DEFAULT_USER_MAP_SETTINGS.markerColors.highways,
        minedoors: DEFAULT_USER_MAP_SETTINGS.markerColors.minedoors,
        notes: "#abcdef"
      },
      markerOpacities: {
        deeds: 0,
        notes: 100,
        riftOverlays: 37,
        towers: 45
      },
      tileHighlight: {
        color: DEFAULT_USER_MAP_SETTINGS.tileHighlight.color,
        opacity: 52,
        selection: ""
      }
    });
  });

  it("keeps valid tile highlight panel positions and rejects invalid ones", () => {
    expect(parseUserMapSettings({
      tileHighlightPanelPosition: {
        left: 120.4,
        top: 88.7
      }
    }).tileHighlightPanelPosition).toEqual({
      left: 120,
      top: 89
    });

    expect(parseUserMapSettings({
      tileHighlightPanelPosition: {
        left: Number.NaN,
        top: 88
      }
    }).tileHighlightPanelPosition).toBeNull();
  });

  it("merges incoming partial settings into current settings", () => {
    const current = parseUserMapSettings({
      markerColors: {
        towers: "#00ff00"
      },
      tileHighlightPanelPosition: {
        left: 10,
        top: 20
      }
    });

    expect(mergeUserMapSettingsInput(current, {
      markerOpacities: {
        towers: 35
      },
      tileHighlightPanelPosition: null
    })).toEqual({
      ...current,
      markerOpacities: {
        ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
        towers: 35
      },
      tileHighlightPanelPosition: null
    });
  });
});
