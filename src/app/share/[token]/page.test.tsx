import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/domain/result";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";

const mocks = vi.hoisted(() => ({
  findActiveMap: vi.fn(),
  findUserFavoriteServerId: vi.fn(),
  getUserMapSettings: vi.fn(),
  listActiveMapSummaries: vi.fn(),
  listMarkers: vi.fn(),
  listNoteCategories: vi.fn(),
  resolveShareLink: vi.fn(),
  workspaceProps: [] as Array<Record<string, unknown>>
}));

vi.mock("@/lib/auth/current-viewer", () => ({
  getCurrentViewer: vi.fn(async () => null)
}));

vi.mock("@/lib/map-settings/database", () => ({
  createUserMapSettingsDependencies: vi.fn(() => ({})),
  findUserFavoriteServerId: mocks.findUserFavoriteServerId
}));

vi.mock("@/lib/map-settings/map-settings-service", () => ({
  getUserMapSettings: mocks.getUserMapSettings
}));

vi.mock("@/lib/markers/database", () => ({
  createMarkerDependencies: vi.fn(() => ({})),
  findActiveMap: mocks.findActiveMap,
  listActiveMapSummaries: mocks.listActiveMapSummaries,
  listNoteCategories: mocks.listNoteCategories
}));

vi.mock("@/lib/markers/marker-service", () => ({
  listMarkers: mocks.listMarkers
}));

vi.mock("@/lib/share/database", () => ({
  createShareDependencies: vi.fn(() => ({}))
}));

vi.mock("@/lib/share/share-service", () => ({
  resolveShareLink: mocks.resolveShareLink
}));

vi.mock("@/app/map/map-workspace", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.workspaceProps.push(props);

    return React.createElement("div", { "data-testid": "map-workspace" });
  }
}));

import SharePage from "./page";

const activeMap = {
  heightPx: 2048,
  id: "map-1",
  imageSrc: "/maps/wurm-map.png",
  layers: [
    {
      heightPx: 2048,
      id: "layer-terrain",
      imageSrc: "/maps/wurm-map.png",
      isDefault: true,
      name: "Terrain",
      widthPx: 2048
    },
    {
      heightPx: 2048,
      id: "layer-topographical",
      imageSrc: "/maps/celebration-topo.png",
      isDefault: false,
      name: "Topographical",
      widthPx: 2048
    }
  ],
  name: "Celebration",
  widthPx: 2048
} as const;

describe("SharePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceProps.length = 0;
    mocks.listActiveMapSummaries.mockResolvedValue([
      { id: "map-1", name: "Celebration" },
      { id: "map-2", name: "Harmony" }
    ]);
    mocks.findUserFavoriteServerId.mockResolvedValue(null);
    mocks.findActiveMap.mockResolvedValue(activeMap);
    mocks.listMarkers.mockResolvedValue(ok({ map: activeMap, markers: [] }));
    mocks.listNoteCategories.mockResolvedValue([]);
    mocks.getUserMapSettings.mockResolvedValue(ok(DEFAULT_USER_MAP_SETTINGS));
  });

  it("renders an invalid-link message when the share link cannot be resolved", async () => {
    mocks.resolveShareLink.mockResolvedValue(err("Share link is invalid or has expired"));

    render(await SharePage({ params: Promise.resolve({ token: "expired-token" }) }));

    expect(screen.getByText("This share link is invalid or has expired.")).toBeTruthy();
    expect(screen.queryByTestId("map-workspace")).toBeNull();
    expect(mocks.listMarkers).not.toHaveBeenCalled();
  });

  it("renders the map workspace with a read-only share view for a valid link", async () => {
    const sharedSettings = {
      ...DEFAULT_USER_MAP_SETTINGS,
      routePlannerSpeedKmh: 8
    };
    mocks.resolveShareLink.mockResolvedValue(ok({
      link: {
        createdBy: { id: "user-1", watermarkNumber: 42 },
        expiresAt: new Date("2026-09-04T00:00:00.000Z"),
        layerId: "layer-topographical",
        mapId: "map-1",
        settings: sharedSettings
      }
    }));

    render(await SharePage({ params: Promise.resolve({ token: "share-token" }) }));

    expect(screen.getByTestId("map-workspace")).toBeTruthy();

    const props = mocks.workspaceProps.at(-1);

    expect(props?.shareToken).toBe("share-token");
    expect(props?.initialSettings).toBe(sharedSettings);
    expect(props?.selectedLayerId).toBe("layer-topographical");
    expect(props?.servers).toEqual([{ id: "map-1", name: "Celebration" }]);

    const map = props?.map as {
      heightPx: number;
      imageSrc: string;
      layers: Array<{ heightPx: number; imageSrc: string; widthPx: number }>;
      widthPx: number;
    };

    expect(map.imageSrc).toContain(`/api/maps/${activeMap.id}/image?v=`);
    expect(map.imageSrc.endsWith("&share=share-token")).toBe(true);
    expect(map.widthPx).toBe(activeMap.widthPx);
    expect(map.heightPx).toBe(activeMap.heightPx);
    expect(map.layers).toHaveLength(2);
    expect(map.layers.every((layer) => layer.imageSrc.endsWith("&share=share-token"))).toBe(true);

    const viewer = props?.viewer as Record<string, unknown>;

    expect(viewer.username).toBe("Shared view");
    expect(viewer.accessLevel).toBe("READ");
    expect(viewer.isAdmin).toBe(false);
  });
});
