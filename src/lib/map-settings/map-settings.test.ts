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
        locateSouls: "#ff8800",
        minedoors: "#00ffff",
        rifts: "#ff0000",
        towers: "#00ff00"
      },
      markerVisibility: {
        bridges: false,
        camps: false,
        canals: false,
        deedPerimeters: false,
        deedNames: true,
        highways: false,
        locateSouls: false,
        minedoors: false,
        riftOverlays: false
      },
      roadwayEditPanelPosition: {
        left: 300.2,
        top: 500.8
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
        locateSouls: "#ff8800",
        minedoors: "#00ffff",
        rifts: "#ff0000",
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
        locateSouls: false,
        minedoors: false,
        riftOverlays: false
      },
      roadwayEditPanelPosition: {
        left: 300,
        top: 501
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
        locateSouls: "#F97316",
        minedoors: "cyan",
        notes: "#ABCDEF",
        rifts: "#DC2626"
      },
      markerOpacities: {
        bridges: 22.8,
        canals: 50.2,
        deeds: -10,
        highways: 101,
        locateSouls: 62.2,
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
        locateSouls: "#f97316",
        minedoors: DEFAULT_USER_MAP_SETTINGS.markerColors.minedoors,
        notes: "#abcdef",
        rifts: "#dc2626"
      },
      markerOpacities: {
        bridges: 23,
        canals: 50,
        deeds: 0,
        highways: 100,
        locateSouls: 62,
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
      roadwayEditPanelPosition: {
        left: 222.4,
        top: 99.6
      },
      tileHighlightPanelPosition: {
        left: 120.4,
        top: 88.7
      }
    })).toMatchObject({
      roadwayEditPanelPosition: {
        left: 222,
        top: 100
      },
      tileHighlightPanelPosition: {
        left: 120,
        top: 89
      }
    });

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
      roadwayEditPanelPosition: {
        left: 22,
        top: Number.NaN
      },
      tileHighlightPanelPosition: {
        left: Number.NaN,
        top: 88
      }
    })).toMatchObject({
      roadwayEditPanelPosition: null,
      tileHighlightPanelPosition: null
    });
  });

  it("keeps valid event feed panel sizes and rejects invalid ones", () => {
    expect(parseUserMapSettings({
      eventFeedPanelSize: {
        height: 312.2,
        width: 476.6
      }
    }).eventFeedPanelSize).toEqual({
      height: 312,
      width: 477
    });

    expect(parseUserMapSettings({
      eventFeedPanelSize: {
        height: 50,
        width: 100
      }
    }).eventFeedPanelSize).toEqual({
      height: 160,
      width: 260
    });

    expect(parseUserMapSettings({
      eventFeedPanelSize: {
        height: Number.NaN,
        width: 480
      }
    }).eventFeedPanelSize).toEqual(DEFAULT_USER_MAP_SETTINGS.eventFeedPanelSize);
  });

  it("merges incoming partial settings into current settings", () => {
    const current = parseUserMapSettings({
      markerColors: {
        towers: "#00ff00"
      },
      roadwayEditPanelPosition: {
        left: 30,
        top: 40
      },
      tileHighlightPanelPosition: {
        left: 10,
        top: 20
      }
    });

    expect(mergeUserMapSettingsInput(current, {
      eventFeedPanelSize: {
        height: 270,
        width: 410
      },
      markerOpacities: {
        towers: 35
      },
      roadwayEditPanelPosition: {
        left: 75,
        top: 90
      },
      tileHighlightPanelPosition: null
    })).toEqual({
      ...current,
      markerOpacities: {
        ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
        towers: 35
      },
      eventFeedPanelSize: {
        height: 270,
        width: 410
      },
      roadwayEditPanelPosition: {
        left: 75,
        top: 90
      },
      tileHighlightPanelPosition: null
    });
  });
});
