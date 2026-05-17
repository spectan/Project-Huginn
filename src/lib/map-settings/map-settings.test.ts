import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_MAP_SETTINGS,
  getFavoriteServerIdFromSettingsRows,
  mergeUserMapSettingsInput,
  parseUserMapSettings
} from "./map-settings";

describe("user map settings", () => {
  it("returns defaults for missing or invalid persisted settings", () => {
    expect(parseUserMapSettings(null)).toEqual(DEFAULT_USER_MAP_SETTINGS);
    expect(parseUserMapSettings("invalid")).toEqual(DEFAULT_USER_MAP_SETTINGS);
    expect(DEFAULT_USER_MAP_SETTINGS.annotations).toEqual([]);
    expect(DEFAULT_USER_MAP_SETTINGS.markerVisibility.annotations).toBe(true);
    expect(DEFAULT_USER_MAP_SETTINGS.markerColors.annotations).toBe("#38bdf8");
    expect(DEFAULT_USER_MAP_SETTINGS.markerOpacities.annotations).toBe(50);
    expect(DEFAULT_USER_MAP_SETTINGS.favoriteServerId).toBeNull();
    expect(DEFAULT_USER_MAP_SETTINGS.searchLinesEnabled).toBe(false);
    expect(DEFAULT_USER_MAP_SETTINGS.routePlannerSpeedKmh).toBe(0);
    expect(DEFAULT_USER_MAP_SETTINGS.markerOpacities.deeds).toBe(100);
    expect(DEFAULT_USER_MAP_SETTINGS.markerOpacities.riftOverlays).toBe(100);
    expect(DEFAULT_USER_MAP_SETTINGS.markerOpacities.towers).toBe(100);
    expect(DEFAULT_USER_MAP_SETTINGS.markerVisibility.tunnels).toBe(true);
    expect(DEFAULT_USER_MAP_SETTINGS.markerColors.tunnels).toBe("#6b7280");
    expect(DEFAULT_USER_MAP_SETTINGS.markerOpacities.tunnels).toBe(50);
    expect(DEFAULT_USER_MAP_SETTINGS.markerVisibility.plannedTowers).toBe(true);
    expect(DEFAULT_USER_MAP_SETTINGS.noteCategoryColors).toEqual({});
    expect(DEFAULT_USER_MAP_SETTINGS.noteCategoryMarkerShapes).toEqual({});
    expect(DEFAULT_USER_MAP_SETTINGS.noteCategoryPipSizes).toEqual({});
  });

  it("merges partial persisted settings over defaults", () => {
    expect(parseUserMapSettings({
      markerColors: {
        annotations: "#123abc",
        bridges: "#cc00cc",
        camps: "#ffcc00",
        canals: "#0055cc",
        highways: "#cccc00",
        locateSouls: "#ff8800",
        minedoors: "#00ffff",
        rifts: "#ff0000",
        tunnels: "#666666",
        towers: "#00ff00"
      },
      noteCategoryColors: {
        "category-general": "#112233",
        "category-landmarks": "#AABBCC"
      },
      noteCategoryMarkerShapes: {
        "category-general": "circle",
        "category-landmarks": "triangle"
      },
      noteCategoryPipSizes: {
        "category-general": 3,
        "category-landmarks": 8
      },
      markerVisibility: {
        annotations: false,
        bridges: false,
        camps: false,
        canals: false,
        deedPerimeters: false,
        deedNames: true,
        highways: false,
        locateSouls: false,
        minedoors: false,
        plannedTowers: false,
        riftOverlays: false,
        tunnels: false
      },
      roadwayEditPanelPosition: {
        left: 300.2,
        top: 500.8
      },
      routePlannerSpeedKmh: 12.4,
      favoriteServerId: " map-cadence ",
      searchLinesEnabled: true,
      tileHighlight: {
        selection: "Clay"
      },
      annotations: [
        {
          id: "annotation-1",
          text: "Private text",
          title: "Private camp",
          type: "annotation",
          x: 125,
          y: 140
        }
      ]
    })).toEqual({
      ...DEFAULT_USER_MAP_SETTINGS,
      annotations: [
        {
          id: "annotation-1",
          text: "Private text",
          title: "Private camp",
          type: "annotation",
          x: 125,
          y: 140
        }
      ],
      markerColors: {
        ...DEFAULT_USER_MAP_SETTINGS.markerColors,
        annotations: "#123abc",
        bridges: "#cc00cc",
        camps: "#ffcc00",
        canals: "#0055cc",
        highways: "#cccc00",
        locateSouls: "#ff8800",
        minedoors: "#00ffff",
        rifts: "#ff0000",
        tunnels: "#666666",
        towers: "#00ff00"
      },
      noteCategoryColors: {
        "category-general": "#112233",
        "category-landmarks": "#aabbcc"
      },
      noteCategoryMarkerShapes: {
        "category-general": "circle",
        "category-landmarks": "triangle"
      },
      noteCategoryPipSizes: {
        "category-general": 3,
        "category-landmarks": 8
      },
      markerVisibility: {
        ...DEFAULT_USER_MAP_SETTINGS.markerVisibility,
        annotations: false,
        bridges: false,
        camps: false,
        canals: false,
        deedPerimeters: false,
        deedNames: true,
        highways: false,
        locateSouls: false,
        minedoors: false,
        plannedTowers: false,
        riftOverlays: false,
        tunnels: false
      },
      roadwayEditPanelPosition: {
        left: 300,
        top: 501
      },
      routePlannerSpeedKmh: 12,
      favoriteServerId: "map-cadence",
      searchLinesEnabled: true,
      tileHighlight: {
        ...DEFAULT_USER_MAP_SETTINGS.tileHighlight,
        selection: "Clay"
      }
    });
  });

  it("sanitizes per-user annotations from settings", () => {
    const parsed = parseUserMapSettings({
      annotations: [
        {
          id: " annotation-1 ",
          text: "  Private text  ",
          title: "  Private camp  ",
          type: "ignored",
          x: 125.4,
          y: 139.6
        },
        {
          id: "annotation-1",
          text: "Duplicate",
          title: "Duplicate",
          x: 1,
          y: 1
        },
        {
          id: "annotation-2",
          text: "Missing title",
          title: "",
          x: 2,
          y: 2
        },
        {
          id: "annotation-3",
          text: "Invalid coordinate",
          title: "Invalid",
          x: Number.NaN,
          y: 2
        }
      ]
    });

    expect(parsed.annotations).toEqual([
      {
        id: "annotation-1",
        text: "Private text",
        title: "Private camp",
        type: "annotation",
        x: 125,
        y: 140
      }
    ]);
  });

  it("keeps the latest explicit favorite server id from settings rows", () => {
    expect(getFavoriteServerIdFromSettingsRows([
      { settings: { favoriteServerId: "map-cadence" } },
      { settings: { favoriteServerId: "map-celebration" } }
    ])).toBe("map-cadence");

    expect(getFavoriteServerIdFromSettingsRows([
      { settings: { markerColors: { towers: "#00ff00" } } },
      { settings: { favoriteServerId: "map-harmony" } }
    ])).toBe("map-harmony");

    expect(getFavoriteServerIdFromSettingsRows([
      { settings: { favoriteServerId: null } },
      { settings: { favoriteServerId: "map-harmony" } }
    ])).toBeNull();
  });

  it("sanitizes invalid colors, opacities, and tile selections", () => {
    expect(parseUserMapSettings({
      markerColors: {
        annotations: "#00BEEF",
        bridges: "#CC00CC",
        camps: "#FEDCBA",
        canals: "#0055CC",
        deeds: "gold",
        highways: "yellow",
        locateSouls: "#F97316",
        minedoors: "cyan",
        notes: "#ABCDEF",
        rifts: "#DC2626",
        tunnels: "#666666"
      },
      markerOpacities: {
        annotations: 88.4,
        bridges: 22.8,
        canals: 50.2,
        deeds: -10,
        highways: 101,
        locateSouls: 62.2,
        notes: 150,
        riftOverlays: 37.2,
        tunnels: 12.2,
        towers: 44.6
      },
      noteCategoryColors: {
        "category-general": "#123456",
        "category-invalid": "pink",
        "": "#abcdef"
      },
      noteCategoryMarkerShapes: {
        "category-general": "square",
        "category-invalid": "diamond",
        "": "triangle"
      },
      noteCategoryPipSizes: {
        "category-general": 10.2,
        "category-invalid": 11,
        "": 5
      },
      tileHighlight: {
        color: "#12xz45",
        opacity: 52.2,
        selection: "Unknown"
      },
      favoriteServerId: ""
    })).toMatchObject({
      markerColors: {
        annotations: "#00beef",
        bridges: "#cc00cc",
        camps: "#fedcba",
        canals: "#0055cc",
        deeds: DEFAULT_USER_MAP_SETTINGS.markerColors.deeds,
        highways: DEFAULT_USER_MAP_SETTINGS.markerColors.highways,
        locateSouls: "#f97316",
        minedoors: DEFAULT_USER_MAP_SETTINGS.markerColors.minedoors,
        notes: "#abcdef",
        rifts: "#dc2626",
        tunnels: "#666666"
      },
      markerOpacities: {
        annotations: 88,
        bridges: 23,
        canals: 50,
        deeds: 0,
        highways: 100,
        locateSouls: 62,
        notes: 100,
        riftOverlays: 37,
        tunnels: 12,
        towers: 45
      },
      noteCategoryColors: {
        "category-general": "#123456"
      },
      noteCategoryMarkerShapes: {
        "category-general": "square"
      },
      noteCategoryPipSizes: {
        "category-general": 10
      },
      tileHighlight: {
        color: DEFAULT_USER_MAP_SETTINGS.tileHighlight.color,
        opacity: 52,
        selection: ""
      },
      favoriteServerId: DEFAULT_USER_MAP_SETTINGS.favoriteServerId
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

  it("keeps valid search line and route speed preferences and rejects invalid ones", () => {
    expect(parseUserMapSettings({
      routePlannerSpeedKmh: 45.6,
      searchLinesEnabled: true
    })).toMatchObject({
      routePlannerSpeedKmh: 46,
      searchLinesEnabled: true
    });

    expect(parseUserMapSettings({
      routePlannerSpeedKmh: -12,
      searchLinesEnabled: "yes"
    })).toMatchObject({
      routePlannerSpeedKmh: 0,
      searchLinesEnabled: DEFAULT_USER_MAP_SETTINGS.searchLinesEnabled
    });

    expect(parseUserMapSettings({
      routePlannerSpeedKmh: 99
    }).routePlannerSpeedKmh).toBe(60);
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
      noteCategoryColors: {
        "category-general": "#445566"
      },
      noteCategoryMarkerShapes: {
        "category-general": "x"
      },
      noteCategoryPipSizes: {
        "category-general": 7
      },
      roadwayEditPanelPosition: {
        left: 75,
        top: 90
      },
      routePlannerSpeedKmh: 27,
      favoriteServerId: "map-cadence",
      searchLinesEnabled: true,
      tileHighlightPanelPosition: null
    })).toEqual({
      ...current,
      markerOpacities: {
        ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
        towers: 35
      },
      noteCategoryColors: {
        "category-general": "#445566"
      },
      noteCategoryMarkerShapes: {
        "category-general": "x"
      },
      noteCategoryPipSizes: {
        "category-general": 7
      },
      eventFeedPanelSize: {
        height: 270,
        width: 410
      },
      roadwayEditPanelPosition: {
        left: 75,
        top: 90
      },
      routePlannerSpeedKmh: 27,
      favoriteServerId: "map-cadence",
      searchLinesEnabled: true,
      tileHighlightPanelPosition: null
    });
  });
});
