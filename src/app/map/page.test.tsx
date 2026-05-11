import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";
import MapWorkspace from "./map-workspace";

const approvedViewer = {
  approvalStatus: "APPROVED",
  isAdmin: true,
  pendingApprovalCount: 0,
  permissions: "WRITE",
  username: "Admin"
} as const;

const readOnlyViewer = {
  ...approvedViewer,
  isAdmin: false,
  permissions: "READ"
} as const;

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

const noteCategories = [
  { id: "category-general", name: "General" },
  { id: "category-landmarks", name: "Landmarks" }
] as const;

describe("MapPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/map");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 2048
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2048
    });
  });

  it("renders a full-page map workspace with quiet account and settings controls", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Cursor")).toBeNull();
    expect(screen.queryByText("Towers")).toBeNull();
    expect(screen.queryByText("Deeds")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();

    expect(screen.queryByRole("toolbar", { name: "Map tools" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zoom out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add tower" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add deed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(screen.queryByText(/^Zoom /)).toBeNull();
    expect(screen.getByRole("button", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map settings" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search map" })).toBeTruthy();
  });

  it("does not render the map image for anonymous users", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: null,
      viewer: null
    }));

    expect(screen.queryByAltText("Wurm Online map")).toBeNull();
    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
  });

  it("renders the configured map image at natural map dimensions", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const mapImage = screen.getByAltText("Wurm Online map");

    expect(mapImage.getAttribute("src")).toBe("/maps/wurm-map.png");
    expect(mapImage.getAttribute("width")).toBe("2048");
    expect(mapImage.getAttribute("height")).toBe("2048");
  });

  it("switches visual map layers without changing the selected server data", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      servers: [
        {
          id: "map-1",
          name: "Celebration"
        }
      ],
      viewer: approvedViewer
    }));

    expect(screen.getByRole("combobox", { name: "Server" })).toHaveProperty("value", "map-1");
    expect(screen.getByRole("option", { name: "Celebration" })).toBeTruthy();

    const mapSelect = screen.getByRole("combobox", { name: "Map" });
    expect(mapSelect).toHaveProperty("value", "layer-terrain");
    expect(screen.getByAltText("Wurm Online map").getAttribute("src")).toBe("/maps/wurm-map.png");
    expect(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" })).toBeTruthy();

    fireEvent.change(mapSelect, {
      target: {
        value: "layer-topographical"
      }
    });

    expect(screen.getByAltText("Wurm Online map").getAttribute("src")).toBe("/maps/celebration-topo.png");
    expect(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" })).toBeTruthy();
  });

  it("prevents native image dragging so pointer panning owns the interaction", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const mapImage = screen.getByAltText("Wurm Online map");

    expect(fireEvent.dragStart(mapImage)).toBe(false);
  });

  it("fits the full map to the viewport and can zoom in with the wheel", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1024
    });

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("0.5"));

    fireEvent.wheel(stage, {
      clientX: 512,
      clientY: 512,
      deltaY: -100
    });

    await waitFor(() => expect(stage.dataset.zoom).toBe("0.6"));
  });

  it("scales the map image directly instead of through the marker transform layer", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1024
    });

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");
    const mapImage = screen.getByAltText("Wurm Online map");

    await waitFor(() => expect(stage.dataset.zoom).toBe("0.5"));
    expect(stage.contains(mapImage)).toBe(false);
    expect(mapImage.style.left).toBe("0px");
    expect(mapImage.style.top).toBe("0px");
    expect(mapImage.style.width).toBe("1024px");
    expect(mapImage.style.height).toBe("1024px");
  });

  it("renders markers in an unscaled screen-space layer", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1024
    });

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");
    const markerLayer = screen.getByTestId("map-marker-layer");

    await waitFor(() => expect(stage.dataset.zoom).toBe("0.5"));

    expect(stage.contains(markerLayer)).toBe(false);
    expect(markerLayer.style.transform).toBe("");
    expect(screen.getByTestId("tower-center-tower-1").style.left).toBe("124.5px");
    expect(screen.getByTestId("tower-center-tower-1").style.width).toBe("1.5px");
    expect(screen.getByTestId("tower-placement-tower-1").style.left).toBe("100px");
    expect(screen.getByTestId("tower-placement-tower-1").style.width).toBe("50.5px");
  });

  it("keeps coordinate URLs out of the first render to avoid hydration mismatch", () => {
    window.history.replaceState(null, "", "/map?x=1070&y=278");

    const clientInitialHtml = renderToString(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));
    vi.unstubAllGlobals();

    expect(clientInitialHtml).toBe(serverHtml);
    expect(clientInitialHtml).not.toContain("Selected coordinate 1070, 278");
  });

  it("centers the initial view on valid coordinate URL parameters", async () => {
    window.history.replaceState(null, "", "/map?x=1070&y=278");

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));
    expect(stage.style.transform).toBe("translate(-46.5px, 745.5px) scale(1)");
  });

  it("supports dragging the map to pan", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 140,
      clientY: 125,
      pointerId: 1
    });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(40px, 25px) scale(1)")
    );
  });

  it("zooms back out to the full fitted map after panning", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 140,
      clientY: 125,
      pointerId: 1
    });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(40px, 25px) scale(1)")
    );

    fireEvent.wheel(stage, {
      clientX: 1024,
      clientY: 1024,
      deltaY: 100
    });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(0px, 0px) scale(1)")
    );
  });

  it("opens a right-click add menu for write users", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });

    const menu = screen.getByRole("menu", { name: "Map actions" });
    expect(menu.className).toContain("map-context-menu");
    expect(screen.getByText("125, 140")).toBeTruthy();
    expect(window.location.href).toBe(`${window.location.origin}/map?x=125&y=140`);
    expect(screen.queryByRole("menuitem", { name: "Copy Link" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Tower" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Deed" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rift" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Camp" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Minedoor" })).toBeTruthy();
  });

  it("updates the browser URL for read-only map context without copy commands", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: readOnlyViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });

    expect(screen.getByRole("menu", { name: "Map actions" })).toBeTruthy();
    expect(screen.getByText("125, 140")).toBeTruthy();
    expect(window.location.href).toBe(`${window.location.origin}/map?x=125&y=140`);
    expect(screen.queryByRole("menuitem", { name: "Copy Link" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Tower" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Deed" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Note" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Rift" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Camp" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Minedoor" })).toBeNull();
  });

  it("renders square marker overlays and tower centers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 7,
          foundingDate: "2026-05-10",
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 10,
          south: 8,
          type: "deed",
          west: 6,
          x: 500,
          y: 600
        },
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 700,
          y: 800
        },
        {
          arrivalDate: "2026-05-10",
          estimatedRiftTime: "2026-05-10T18:30",
          id: "rift-1",
          notes: "Bring cotton",
          type: "rift",
          x: 900,
          y: 1000
        },
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "",
          type: "camp",
          x: 910,
          y: 1010
        },
        {
          id: "minedoor-1",
          notes: "Hidden entrance",
          strength: "73ql",
          type: "minedoor",
          x: 920,
          y: 1020
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const tower = screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" });
    expect(tower).toBeTruthy();
    const innerTowerOverlay = screen.getByTestId("tower-protection-tower-1");
    const outerTowerOverlay = screen.getByTestId("tower-placement-tower-1");
    const towerCenter = screen.getByTestId("tower-center-tower-1");
    expect(towerCenter.style.left).toBe("249px");
    expect(towerCenter.style.top).toBe("299px");
    expect(towerCenter.style.width).toBe("3px");
    expect(towerCenter.style.height).toBe("3px");
    expect(innerTowerOverlay.style.left).toBe("225px");
    expect(innerTowerOverlay.style.top).toBe("275px");
    expect(innerTowerOverlay.style.width).toBe("51px");
    expect(innerTowerOverlay.style.height).toBe("51px");
    expect(outerTowerOverlay.style.left).toBe("200px");
    expect(outerTowerOverlay.style.top).toBe("250px");
    expect(outerTowerOverlay.style.width).toBe("101px");
    expect(outerTowerOverlay.style.height).toBe("101px");
    expect(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeTruthy();
    const deedOverlay = screen.getByTestId("deed-overlay-deed-1");
    expect(deedOverlay.style.left).toBe("494px");
    expect(deedOverlay.style.top).toBe("595px");
    expect(deedOverlay.style.width).toBe("14px");
    expect(deedOverlay.style.height).toBe("14px");
    const perimeterTop = screen.getByTestId("deed-perimeter-top-deed-1");
    expect(perimeterTop.style.left).toBe("484px");
    expect(perimeterTop.style.top).toBe("585px");
    expect(perimeterTop.style.width).toBe("34px");
    expect(perimeterTop.style.height).toBe("1px");
    const perimeterBottom = screen.getByTestId("deed-perimeter-bottom-deed-1");
    expect(perimeterBottom.style.left).toBe("484px");
    expect(perimeterBottom.style.top).toBe("618px");
    expect(perimeterBottom.style.width).toBe("34px");
    expect(perimeterBottom.style.height).toBe("1px");
    const perimeterLeft = screen.getByTestId("deed-perimeter-left-deed-1");
    expect(perimeterLeft.style.left).toBe("484px");
    expect(perimeterLeft.style.top).toBe("585px");
    expect(perimeterLeft.style.width).toBe("1px");
    expect(perimeterLeft.style.height).toBe("34px");
    const perimeterRight = screen.getByTestId("deed-perimeter-right-deed-1");
    expect(perimeterRight.style.left).toBe("517px");
    expect(perimeterRight.style.top).toBe("585px");
    expect(perimeterRight.style.width).toBe("1px");
    expect(perimeterRight.style.height).toBe("34px");
    const deedCenter = screen.getByTestId("deed-center-deed-1");
    expect(deedCenter.style.left).toBe("499px");
    expect(deedCenter.style.top).toBe("599px");
    expect(deedCenter.style.width).toBe("3px");
    expect(deedCenter.style.height).toBe("3px");
    const note = screen.getByRole("button", { name: "Note General - Scout note at 700, 800" });
    expect(note.style.left).toBe("699px");
    expect(note.style.top).toBe("799px");
    expect(note.style.width).toBe("3px");
    expect(note.style.height).toBe("3px");
    expect(note.className).toContain("map-marker--note");
    const rift = screen.getByRole("button", { name: "Rift at 900, 1000" });
    expect(rift.style.left).toBe("899px");
    expect(rift.style.top).toBe("999px");
    expect(rift.style.width).toBe("3px");
    expect(rift.style.height).toBe("3px");
    expect(rift.className).toContain("map-marker--rift");
    const camp = screen.getByRole("button", { name: "Camp Goblin at 910, 1010" });
    expect(camp.style.left).toBe("909px");
    expect(camp.style.top).toBe("1009px");
    expect(camp.className).toContain("map-marker--camp");
    const minedoor = screen.getByRole("button", { name: "Minedoor at 920, 1020" });
    expect(minedoor.style.left).toBe("920px");
    expect(minedoor.style.top).toBe("1020px");
    expect(minedoor.style.width).toBe("1px");
    expect(minedoor.style.height).toBe("1px");
    expect(minedoor.className).toContain("map-marker--minedoor");
  });

  it("opens a deed create form with name, mayor, and 5-tile default directional dimensions", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Deed" }));

    expect(screen.getByRole("dialog", { name: "Add deed" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Mayor")).toBeTruthy();
    expect(screen.getByLabelText("Founding date")).toHaveProperty("value", "");
    expect(screen.getByLabelText("North")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("West")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("East")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("South")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("Perimeter")).toHaveProperty("value", "5");
  });

  it("opens a tower create form with one creator field", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Tower" }));

    expect(screen.getByRole("dialog", { name: "Add tower" })).toBeTruthy();
    expect(screen.getByLabelText("Creator")).toBeTruthy();
    expect(screen.queryByLabelText("Creator name")).toBeNull();
    expect(screen.queryByLabelText("Creator number")).toBeNull();
  });

  it("opens a note create form with title, category dropdown, and admin category creation", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));

    const dialog = screen.getByRole("dialog", { name: "Add note" });
    expect(dialog.className).toContain("map-marker-dialog");
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Category")).toHaveProperty("value", "General");
    expect(screen.getByRole("option", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Landmarks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add note category" })).toBeTruthy();
  });

  it("opens a rift create form with optional date, time, and notes fields", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rift" }));

    expect(screen.getByRole("dialog", { name: "Add rift" })).toBeTruthy();
    expect(screen.getByLabelText("Date of arrival")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Estimated rift time")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "");
  });

  it("opens a camp create form with a camp type dropdown and optional notes", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Camp" }));

    expect(screen.getByRole("dialog", { name: "Add camp" })).toBeTruthy();
    expect(screen.getByLabelText("Type")).toHaveProperty("value", "Rift");
    expect(screen.getByRole("option", { name: "Rift" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Goblin" })).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "");
  });

  it("opens a minedoor create form with optional strength and notes", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Minedoor" }));

    expect(screen.getByRole("dialog", { name: "Add minedoor" })).toBeTruthy();
    expect(screen.getByLabelText("Strength")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "");
  });

  it("hides note category creation for non-admin writers", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: {
        ...approvedViewer,
        isAdmin: false,
        username: "Writer"
      }
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));

    expect(screen.getByLabelText("Category")).toHaveProperty("value", "General");
    expect(screen.queryByRole("button", { name: "Add note category" })).toBeNull();
  });

  it("allows admins to add a note category from the note form", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ category: { id: "category-hotas", name: "HotA" } }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));
    fireEvent.click(screen.getByRole("button", { name: "Add note category" }));
    fireEvent.change(screen.getByLabelText("New category"), {
      target: { value: "HotA" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save category" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/note-categories",
      {
        body: JSON.stringify({ name: "HotA" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }
    ));
    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveProperty("value", "HotA"));
  });

  it("shows cursor-following dark hover details instead of inline hover cards", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 5,
          foundingDate: "2026-05-10",
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const tower = screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" });

    expect(tower.querySelector(".map-marker-hover-card")).toBeNull();
    expect(screen.queryByRole("tooltip", { name: "Tower: Mako 945" })).toBeNull();

    fireEvent.mouseMove(tower, {
      clientX: 320,
      clientY: 330
    });

    const towerDetails = screen.getByRole("tooltip", { name: "Tower: Mako 945" });
    expect(towerDetails.className).toContain("map-hover-details");
    expect(towerDetails.style.left).toBe("334px");
    expect(towerDetails.style.top).toBe("344px");
    expect(screen.getByText("Tower: Mako 945")).toBeTruthy();
    expect(screen.getByText("QL")).toBeTruthy();
    expect(screen.getByText("88.50")).toBeTruthy();
    expect(screen.getByText("DMG")).toBeTruthy();
    expect(screen.getByText("1.25")).toBeTruthy();
    expect(screen.queryByText("Creator")).toBeNull();

    fireEvent.mouseLeave(tower);
    expect(screen.queryByRole("tooltip", { name: "Tower: Mako 945" })).toBeNull();

    const deed = screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" });
    fireEvent.mouseMove(deed, {
      clientX: 420,
      clientY: 430
    });

    expect(screen.getByRole("tooltip", { name: "Deed: Oak Harbour" })).toBeTruthy();
    expect(screen.getByText("Deed: Oak Harbour")).toBeTruthy();
    expect(screen.queryByText("Name")).toBeNull();
    expect(screen.getByText("Mayor")).toBeTruthy();
    expect(screen.getByText("Founder")).toBeTruthy();
    expect(screen.getByText("Dimensions")).toBeTruthy();
    expect(screen.getByText("11x11")).toBeTruthy();
    expect(screen.getByText("Founding date")).toBeTruthy();
    expect(screen.getByText("2026-05-10")).toBeTruthy();
  });

  it("displays incomplete tower creator numbers as unknown", async () => {
    const savedTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "",
      ql: "88.50",
      type: "tower",
      x: 250,
      y: 300
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: savedTower }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [savedTower],
      map: activeMap,
      viewer: approvedViewer
    }));

    const tower = screen.getByRole("button", { name: "Tower by Mako - ??? at 250, 300" });
    fireEvent.mouseMove(tower, {
      clientX: 320,
      clientY: 330
    });

    expect(screen.getByRole("tooltip", { name: "Tower: Mako - ???" })).toBeTruthy();

    fireEvent.contextMenu(tower, {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako - ???" }));

    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Mako - ???");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/tower/tower-1",
      {
        body: JSON.stringify({
          type: "tower",
          x: 250,
          y: 300,
          damage: "1.25",
          makerName: "Mako",
          makerNumber: "",
          ql: "88.50"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
  });

  it("shows note hover details as category and title with note text underneath", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          category: "Landmarks",
          id: "note-1",
          text: "Scout here",
          title: "Mine entrance",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const note = screen.getByRole("button", { name: "Note Landmarks - Mine entrance at 700, 800" });

    fireEvent.mouseMove(note, {
      clientX: 720,
      clientY: 730
    });

    expect(screen.getByRole("tooltip", { name: "Landmarks - Mine entrance" })).toBeTruthy();
    expect(screen.getByText("Scout here")).toBeTruthy();
  });

  it("shows hover details for rifts, camps, and minedoors", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          arrivalDate: "2026-05-10",
          estimatedRiftTime: "2026-05-10T18:30",
          id: "rift-1",
          notes: "Bring cotton",
          type: "rift",
          x: 900,
          y: 1000
        },
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "Needs scouts",
          type: "camp",
          x: 910,
          y: 1010
        },
        {
          id: "minedoor-1",
          notes: "Hidden entrance",
          strength: "73ql",
          type: "minedoor",
          x: 920,
          y: 1020
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.mouseMove(screen.getByRole("button", { name: "Rift at 900, 1000" }), {
      clientX: 900,
      clientY: 1000
    });
    expect(screen.getByRole("tooltip", { name: "Rift" })).toBeTruthy();
    expect(screen.getByText("Date of arrival")).toBeTruthy();
    expect(screen.getByText("2026-05-10")).toBeTruthy();
    expect(screen.getByText("Estimated rift time")).toBeTruthy();
    expect(screen.getByText("2026-05-10T18:30")).toBeTruthy();
    expect(screen.getByText("Bring cotton")).toBeTruthy();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Camp Goblin at 910, 1010" }), {
      clientX: 910,
      clientY: 1010
    });
    expect(screen.getByRole("tooltip", { name: "Camp: Goblin" })).toBeTruthy();
    expect(screen.getByText("Needs scouts")).toBeTruthy();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Minedoor at 920, 1020" }), {
      clientX: 920,
      clientY: 1020
    });
    expect(screen.getByRole("tooltip", { name: "Minedoor" })).toBeTruthy();
    expect(screen.getByText("Strength")).toBeTruthy();
    expect(screen.getByText("73ql")).toBeTruthy();
    expect(screen.getByText("Hidden entrance")).toBeTruthy();
  });

  it("moves compact map layer controls into the settings cog", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        },
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("dialog", { name: "Account settings" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Overlays" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    expect(screen.getByRole("dialog", { name: "Map settings" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Deed Names" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Mission Grid" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Map visibility" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Map colors" })).toBeNull();
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    expect(layerControls.getByRole("checkbox", { name: "Overlays" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Towers" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Tower Names" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deeds" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deed Perimeters" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deed Names" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Notes" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Camps" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Minedoors" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Canals" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Highways" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Rift Overlays" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Grid Overlay" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Mission Grid" })).toBeTruthy();
    expect(layerControls.getByLabelText("Towers color")).toBeTruthy();
    expect(layerControls.getByLabelText("Deeds color")).toBeTruthy();
    expect(layerControls.getByLabelText("Notes color")).toBeTruthy();
    expect(layerControls.getByLabelText("Camps color")).toHaveProperty("value", "#facc15");
    expect(layerControls.getByLabelText("Minedoors color")).toHaveProperty("value", "#22d3ee");
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", "#cc00cc");
    expect(layerControls.getByLabelText("Canals color")).toHaveProperty("value", "#0055cc");
    expect(layerControls.getByLabelText("Highways color")).toHaveProperty("value", "#cccc00");
    expect(layerControls.getByLabelText("Grid Overlay color")).toBeTruthy();
    expect(layerControls.getByLabelText("Mission Grid color")).toBeTruthy();
    expect(layerControls.getByLabelText("Tile highlight color")).toHaveProperty("value", "#c000ff");
    expect(layerControls.getByRole("slider", { name: "Towers opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Deeds opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Notes opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Rift Overlay opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Grid Overlay opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Mission Grid opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "75");
    expect(layerControls.queryByText("Tower color")).toBeNull();
    expect(layerControls.queryByText("Deed color")).toBeNull();
    expect(layerControls.queryByText("Note color")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Overlays" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Deeds" }));

    expect(screen.queryByTestId("tower-protection-tower-1")).toBeNull();
    expect(screen.queryByTestId("tower-placement-tower-1")).toBeNull();
    expect(screen.queryByTestId("deed-overlay-deed-1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" })).toBeTruthy();

    fireEvent.change(layerControls.getByLabelText("Towers color"), {
      target: { value: "#00ff00" }
    });
    fireEvent.change(layerControls.getByLabelText("Notes color"), {
      target: { value: "#ff00ff" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Towers opacity" }), {
      target: { value: "45" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Notes opacity" }), {
      target: { value: "65" }
    });

    expect(screen.getByTestId("tower-center-tower-1").style.backgroundColor).toBe("rgb(0, 255, 0)");
    expect(screen.getByTestId("tower-center-tower-1").style.opacity).toBe("0.45");
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }).style.backgroundColor).toBe("rgb(255, 0, 255)");
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }).style.opacity).toBe("0.65");
  });

  it("toggles the WurmMaps sector grid separately from the mission grid", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByTestId("sector-grid-overlay")).toBeNull();
    expect(screen.queryByTestId("mission-grid-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grid Overlay" }));

    const sectorGrid = screen.getByTestId("sector-grid-overlay");
    expect(sectorGrid).toBeTruthy();
    expect(screen.getByText("B7")).toBeTruthy();
    expect(screen.getByText("U26")).toBeTruthy();
    expect(sectorGrid.style.color).toBe("rgb(255, 255, 255)");
    expect(sectorGrid.style.getPropertyValue("--map-sector-grid-color")).toBe("#ffffff");
    expect(screen.queryByTestId("mission-grid-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mission Grid" }));

    const missionGrid = screen.getByTestId("mission-grid-overlay");
    expect(missionGrid).toBeTruthy();
    expect(missionGrid.className).toContain("map-mission-grid");

    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.change(layerControls.getByLabelText("Grid Overlay color"), {
      target: { value: "#ff8800" }
    });
    fireEvent.change(layerControls.getByLabelText("Mission Grid color"), {
      target: { value: "#00ffaa" }
    });

    expect(sectorGrid.style.color).toBe("rgb(255, 136, 0)");
    expect(sectorGrid.style.getPropertyValue("--map-sector-grid-color")).toBe("#ff8800");
    expect(missionGrid.style.color).toBe("rgb(0, 255, 170)");
    expect(missionGrid.style.getPropertyValue("--map-mission-grid-color")).toBe("#00ffaa");
  });

  it("keeps tile highlighting selections outside settings and moves appearance controls into settings", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const tileHighlightPanel = screen.getByRole("group", { name: "Tile Highlighting" });
    const tileHighlighting = within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" });

    expect(tileHighlighting).toHaveProperty("value", "");
    expect(within(tileHighlightPanel).queryByLabelText("Tile highlight color")).toBeNull();
    expect(within(tileHighlightPanel).queryByRole("slider", { name: "Tile highlight opacity" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));

    const settings = screen.getByRole("dialog", { name: "Map settings" });
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));

    expect(within(settings).queryByRole("group", { name: "Tile Highlighting" })).toBeNull();
    expect(layerControls.getByLabelText("Tile highlight color")).toHaveProperty("value", "#c000ff");
    expect(layerControls.getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "75");
    [
      "Cave Entrance",
      "Clay",
      "Moss",
      "Peat",
      "Tar",
      "All Roads",
      "Cobblestone",
      "Paved Brick",
      "Paved Slabs",
      "Grass",
      "Tree / Bush",
      "Dirt",
      "Sand",
      "Rock",
      "Cliff",
      "Steppe",
      "Tundra",
      "Marsh",
      "Lava",
      "Mycelium",
      "Infected Tree / Bush",
      "Hay Drying Tile"
    ].forEach((optionName) => {
      expect(within(tileHighlightPanel).getByRole("option", { name: optionName })).toBeTruthy();
    });

    fireEvent.change(tileHighlighting, { target: { value: "Clay" } });
    fireEvent.change(layerControls.getByLabelText("Tile highlight color"), {
      target: { value: "#00ff00" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Tile highlight opacity" }), {
      target: { value: "55" }
    });

    expect(tileHighlighting).toHaveProperty("value", "Clay");
    expect(layerControls.getByLabelText("Tile highlight color")).toHaveProperty("value", "#00ff00");
    expect(layerControls.getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "55");
  });

  it("lets users drag the tile highlighting selector to a new screen position", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const tileHighlightPanel = screen.getByRole("group", { name: "Tile Highlighting" });
    const dragHandle = screen.getByTestId("tile-highlight-drag-handle");

    fireEvent.pointerDown(dragHandle, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 7
    });
    fireEvent.pointerMove(window, {
      clientX: 70,
      clientY: 55,
      pointerId: 7
    });
    fireEvent.pointerUp(window, { pointerId: 7 });

    expect(tileHighlightPanel.className).toContain("is-positioned");
    expect(tileHighlightPanel.style.left).toBe("60px");
    expect(tileHighlightPanel.style.top).toBe("45px");
  });

  it("renders saved user map settings from the server", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        markerColors: {
          ...DEFAULT_USER_MAP_SETTINGS.markerColors,
          bridges: "#d946ef",
          camps: "#f59e0b",
          canals: "#2563eb",
          highways: "#fde047",
          minedoors: "#06b6d4",
          sectorGrid: "#ff8800"
        },
        markerOpacities: {
          ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
          riftOverlays: 62,
          sectorGrid: 45
        },
        markerVisibility: {
          ...DEFAULT_USER_MAP_SETTINGS.markerVisibility,
          bridges: false,
          camps: false,
          canals: false,
          deedPerimeters: false,
          highways: false,
          minedoors: false,
          riftOverlays: false,
          sectorGrid: true
        },
        tileHighlight: {
          color: "#00ffaa",
          opacity: 55,
          selection: "Clay"
        },
        tileHighlightPanelPosition: {
          left: 72,
          top: 44
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    const tileHighlightPanel = screen.getByRole("group", { name: "Tile Highlighting" });
    expect(tileHighlightPanel.className).toContain("is-positioned");
    expect(tileHighlightPanel.style.left).toBe("72px");
    expect(tileHighlightPanel.style.top).toBe("44px");
    expect(within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" })).toHaveProperty("value", "Clay");

    const sectorGrid = screen.getByTestId("sector-grid-overlay");
    expect(sectorGrid.style.color).toBe("rgb(255, 136, 0)");
    expect(sectorGrid.style.opacity).toBe("0.45");

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    expect(layerControls.getByRole("checkbox", { name: "Camps" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Deed Perimeters" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Minedoors" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Canals" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Highways" })).toHaveProperty("checked", false);
    expect(layerControls.getByLabelText("Camps color")).toHaveProperty("value", "#f59e0b");
    expect(layerControls.getByLabelText("Minedoors color")).toHaveProperty("value", "#06b6d4");
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", "#d946ef");
    expect(layerControls.getByLabelText("Canals color")).toHaveProperty("value", "#2563eb");
    expect(layerControls.getByLabelText("Highways color")).toHaveProperty("value", "#fde047");
    expect(layerControls.getByLabelText("Tile highlight color")).toHaveProperty("value", "#00ffaa");
    expect(layerControls.getByRole("checkbox", { name: "Rift Overlays" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("slider", { name: "Rift Overlay opacity" })).toHaveProperty("value", "62");
    expect(layerControls.getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "55");
  });

  it("saves user map settings when tile highlighter appearance and position change", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.change(layerControls.getByLabelText("Tile highlight color"), {
      target: { value: "#00ff00" }
    });

    fireEvent.pointerDown(screen.getByTestId("tile-highlight-drag-handle"), {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 11
    });
    fireEvent.pointerMove(window, {
      clientX: 70,
      clientY: 55,
      pointerId: 11
    });
    fireEvent.pointerUp(window, { pointerId: 11 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));

    const calls = fetchMock.mock.calls as unknown as Array<[string | URL | Request, RequestInit?]>;
    const lastCall = calls.at(-1);
    const requestInit = lastCall?.[1];
    expect(requestInit).toBeDefined();

    if (requestInit === undefined) {
      return;
    }

    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      tileHighlight: {
        color: "#00ff00"
      },
      tileHighlightPanelPosition: {
        left: 60,
        top: 45
      }
    });
  });

  it("applies opacity sliders to marker and grid layers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        },
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 700,
          y: 800
        },
        {
          arrivalDate: null,
          estimatedRiftTime: null,
          id: "rift-1",
          notes: "",
          type: "rift",
          x: 900,
          y: 1000
        },
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "",
          type: "camp",
          x: 910,
          y: 1010
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grid Overlay" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mission Grid" }));

    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.change(layerControls.getByRole("slider", { name: "Towers opacity" }), {
      target: { value: "40" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Deeds opacity" }), {
      target: { value: "55" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Notes opacity" }), {
      target: { value: "65" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Rift Overlay opacity" }), {
      target: { value: "45" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Grid Overlay opacity" }), {
      target: { value: "35" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Mission Grid opacity" }), {
      target: { value: "80" }
    });

    expect(screen.getByTestId("tower-center-tower-1").style.opacity).toBe("0.4");
    expect(screen.getByTestId("tower-protection-tower-1").style.opacity).toBe("0.4");
    expect(screen.getByTestId("deed-center-deed-1").style.opacity).toBe("0.55");
    expect(screen.getByTestId("deed-overlay-deed-1").style.opacity).toBe("0.55");
    expect(screen.getByTestId("note-center-note-1").style.opacity).toBe("0.65");
    expect(screen.getByTestId("rift-overlay-rift-1").style.opacity).toBe("0.45");
    expect(screen.queryByTestId("rift-overlay-camp-1")).toBeNull();
    expect(screen.getByTestId("sector-grid-overlay").style.opacity).toBe("0.35");
    expect(screen.getByTestId("mission-grid-overlay").style.opacity).toBe("0.8");
  });

  it("toggles and recolors camp and minedoor marker layers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "",
          type: "camp",
          x: 910,
          y: 1010
        },
        {
          id: "minedoor-1",
          notes: "",
          strength: "",
          type: "minedoor",
          x: 920,
          y: 1020
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const camp = screen.getByRole("button", { name: "Camp Goblin at 910, 1010" });
    const minedoor = screen.getByRole("button", { name: "Minedoor at 920, 1020" });
    expect(camp.style.getPropertyValue("--map-camp-color")).toBe("#facc15");
    expect(minedoor.style.getPropertyValue("--map-minedoor-color")).toBe("#22d3ee");

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.change(layerControls.getByLabelText("Camps color"), {
      target: { value: "#f59e0b" }
    });
    fireEvent.change(layerControls.getByLabelText("Minedoors color"), {
      target: { value: "#06b6d4" }
    });

    expect(screen.getByRole("button", { name: "Camp Goblin at 910, 1010" }).style.getPropertyValue("--map-camp-color")).toBe("#f59e0b");
    expect(screen.getByRole("button", { name: "Minedoor at 920, 1020" }).style.getPropertyValue("--map-minedoor-color")).toBe("#06b6d4");

    fireEvent.click(layerControls.getByRole("checkbox", { name: "Camps" }));
    fireEvent.click(layerControls.getByRole("checkbox", { name: "Minedoors" }));

    expect(screen.queryByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Minedoor at 920, 1020" })).toBeNull();
  });

  it("renders a toggleable 51x51 overlay for rifts only", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          arrivalDate: null,
          estimatedRiftTime: null,
          id: "rift-1",
          notes: "",
          type: "rift",
          x: 900,
          y: 1000
        },
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "",
          type: "camp",
          x: 910,
          y: 1010
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const overlay = screen.getByTestId("rift-overlay-rift-1");
    expect(overlay.style.left).toBe("875px");
    expect(overlay.style.top).toBe("975px");
    expect(overlay.style.width).toBe("51px");
    expect(overlay.style.height).toBe("51px");
    expect(screen.queryByTestId("rift-overlay-camp-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.click(layerControls.getByRole("checkbox", { name: "Rift Overlays" }));

    expect(screen.queryByTestId("rift-overlay-rift-1")).toBeNull();
    expect(screen.getByRole("button", { name: "Rift at 900, 1000" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeTruthy();
  });

  it("toggles deed perimeters independently from deed overlays", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByTestId("deed-overlay-deed-1")).toBeTruthy();
    expect(screen.getByTestId("deed-perimeter-top-deed-1")).toBeTruthy();
    expect(screen.getByTestId("deed-center-deed-1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.click(layerControls.getByRole("checkbox", { name: "Deed Perimeters" }));

    expect(screen.getByTestId("deed-overlay-deed-1")).toBeTruthy();
    expect(screen.queryByTestId("deed-perimeter-top-deed-1")).toBeNull();
    expect(screen.queryByTestId("deed-perimeter-bottom-deed-1")).toBeNull();
    expect(screen.queryByTestId("deed-perimeter-left-deed-1")).toBeNull();
    expect(screen.queryByTestId("deed-perimeter-right-deed-1")).toBeNull();
    expect(screen.getByTestId("deed-center-deed-1")).toBeTruthy();
  });

  it("renders toggleable and recolorable infrastructure paths", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "path-1",
          name: "Cedar Bridge",
          notes: "Two lanes",
          points: [
            { x: 100, y: 120 },
            { x: 140, y: 120 }
          ],
          type: "bridge",
          width: 2,
          x: 100,
          y: 120
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const bridge = screen.getByTestId("path-marker-path-1");
    expect(bridge.getAttribute("stroke")).toBe("#cc00cc");
    expect(bridge.getAttribute("stroke-width")).toBe("2");
    expect(bridge.getAttribute("points")).toBe("100.5,120.5 140.5,120.5");

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    fireEvent.change(layerControls.getByLabelText("Bridges color"), {
      target: { value: "#d946ef" }
    });

    expect(screen.getByTestId("path-marker-path-1").getAttribute("stroke")).toBe("#d946ef");

    fireEvent.click(layerControls.getByRole("checkbox", { name: "Bridges" }));

    expect(screen.queryByTestId("path-marker-path-1")).toBeNull();
  });

  it("draws a bridge path by clicking map points and saves it", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        marker: {
          id: "path-1",
          name: "Cedar Bridge",
          notes: "Two lanes",
          points: [
            { x: 100, y: 120 },
            { x: 140, y: 120 }
          ],
          type: "bridge",
          width: 2,
          x: 100,
          y: 120
        }
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const viewport = screen.getByLabelText("Map image area");
    fireEvent.contextMenu(viewport, {
      clientX: 100,
      clientY: 120
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Bridge" }));

    const drawDialog = screen.getByRole("dialog", { name: "Draw Bridge" });
    expect(within(drawDialog).getByText("1 point")).toBeTruthy();

    fireEvent.pointerDown(viewport, {
      button: 0,
      clientX: 140,
      clientY: 120,
      pointerId: 44
    });
    fireEvent.pointerUp(window, {
      clientX: 140,
      clientY: 120,
      pointerId: 44
    });

    expect(within(drawDialog).getByText("2 points")).toBeTruthy();
    fireEvent.change(within(drawDialog).getByLabelText("Name"), {
      target: { value: "Cedar Bridge" }
    });
    fireEvent.change(within(drawDialog).getByLabelText("Width"), {
      target: { value: "2" }
    });
    fireEvent.change(within(drawDialog).getByLabelText("Notes"), {
      target: { value: "Two lanes" }
    });
    fireEvent.click(within(drawDialog).getByRole("button", { name: "Save path" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/markers",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    ));

    const requestInit = (fetchMock.mock.calls[0] as [unknown, RequestInit | undefined] | undefined)?.[1];
    expect(requestInit).toBeDefined();

    if (requestInit === undefined) {
      return;
    }

    expect(JSON.parse(String(requestInit.body))).toEqual({
      name: "Cedar Bridge",
      notes: "Two lanes",
      points: [
        { x: 100, y: 120 },
        { x: 140, y: 120 }
      ],
      type: "bridge",
      width: 2
    });
    expect(screen.getByTestId("path-marker-path-1")).toBeTruthy();
  });

  it("does not add path points from pointer events outside the map viewport", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const viewport = screen.getByLabelText("Map image area");
    fireEvent.contextMenu(viewport, {
      clientX: 100,
      clientY: 120
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Bridge" }));

    const drawDialog = screen.getByRole("dialog", { name: "Draw Bridge" });
    expect(within(drawDialog).getByText("1 point")).toBeTruthy();

    fireEvent.pointerUp(window, {
      clientX: 240,
      clientY: 260,
      pointerId: 77
    });

    expect(within(drawDialog).getByText("1 point")).toBeTruthy();
    expect(within(drawDialog).queryByText("2 points")).toBeNull();
  });

  it("requires highway details mode before highways show hover details or marker actions", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "highway-1",
          name: "East Road",
          notes: "Main route",
          points: [
            { x: 120, y: 130 },
            { x: 180, y: 130 }
          ],
          type: "highway",
          width: 2,
          x: 120,
          y: 130
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const highway = screen.getByTestId("path-marker-highway-1");

    fireEvent.mouseMove(highway, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.queryByRole("tooltip", { name: "Highway: East Road" })).toBeNull();

    fireEvent.contextMenu(highway, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.queryByRole("menu", { name: "Marker actions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    const layerControls = within(screen.getByRole("group", { name: "Map layers" }));
    const highwayDetails = layerControls.getByRole("checkbox", { name: "Highway Details" });
    expect(highwayDetails).toHaveProperty("checked", false);
    fireEvent.click(highwayDetails);

    fireEvent.mouseMove(highway, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.getByRole("tooltip", { name: "Highway: East Road" })).toBeTruthy();

    fireEvent.contextMenu(highway, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
  });

  it("shows tower name labels until the tower is hovered for details", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByTestId("tower-name-label-tower-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tower Names" }));

    const label = screen.getByTestId("tower-name-label-tower-1");
    expect(label.textContent).toBe("Mako 945");
    expect(screen.queryByRole("tooltip", { name: "Tower: Mako 945" })).toBeNull();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 420,
      clientY: 430
    });

    expect(screen.queryByTestId("tower-name-label-tower-1")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "Tower: Mako 945" })).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }));

    expect(screen.getByTestId("tower-name-label-tower-1").textContent).toBe("Mako 945");
  });

  it("shows deed name labels until the deed is hovered for details", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByTestId("deed-name-label-deed-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Deed Names" }));

    const label = screen.getByTestId("deed-name-label-deed-1");
    expect(label.textContent).toBe("Oak Harbour");
    expect(screen.queryByRole("tooltip", { name: "Deed: Oak Harbour" })).toBeNull();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" }), {
      clientX: 420,
      clientY: 430
    });

    expect(screen.queryByTestId("deed-name-label-deed-1")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "Deed: Oak Harbour" })).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" }));

    expect(screen.getByTestId("deed-name-label-deed-1").textContent).toBe("Oak Harbour");
  });

  it("renders a selected-coordinate reticule from shared coordinate links", async () => {
    window.history.replaceState(null, "", "/map?x=1070&y=278");

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    await waitFor(() => expect(screen.getByTestId("map-stage").dataset.zoom).toBe("1"));

    const reticule = screen.getByTestId("selected-coordinate-reticule");
    expect(reticule.getAttribute("aria-label")).toBe("Selected coordinate 1070, 278");
    expect(reticule.style.left).toBe("1024px");
    expect(reticule.style.top).toBe("1024px");
  });

  it("selects a coordinate with a left click and updates the current link", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 125,
      clientY: 140,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 125,
      clientY: 140,
      pointerId: 1
    });

    const reticule = screen.getByTestId("selected-coordinate-reticule");
    expect(reticule.getAttribute("aria-label")).toBe("Selected coordinate 125, 140");
    expect(window.location.href).toBe(`${window.location.origin}/map?x=125&y=140`);
  });

  it("filters markers by search and highlights matching centers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        },
        {
          category: "Landmarks",
          id: "note-1",
          text: "Scout here",
          title: "Mine entrance",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search map" }), {
      target: { value: "mine" }
    });

    expect(screen.queryByRole("button", { name: "Tower by Mako 945 at 250, 300" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeNull();
    expect(screen.getByRole("button", { name: "Note Landmarks - Mine entrance at 700, 800" })).toBeTruthy();
    expect(screen.getByTestId("note-center-note-1").className).toContain("map-search-match");
  });

  it("searches rifts, camps, and minedoors by type aliases and details", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          arrivalDate: "2026-05-10",
          estimatedRiftTime: "2026-05-10T18:30",
          id: "rift-1",
          notes: "Bring cotton",
          type: "rift",
          x: 900,
          y: 1000
        },
        {
          campType: "Goblin",
          id: "camp-1",
          notes: "Needs scouts",
          type: "camp",
          x: 910,
          y: 1010
        },
        {
          id: "minedoor-1",
          notes: "Hidden entrance",
          strength: "73ql",
          type: "minedoor",
          x: 920,
          y: 1020
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const searchbox = screen.getByRole("searchbox", { name: "Search map" });

    fireEvent.change(searchbox, { target: { value: "rifts" } });
    expect(screen.getByRole("button", { name: "Rift at 900, 1000" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Minedoor at 920, 1020" })).toBeNull();

    fireEvent.change(searchbox, { target: { value: "camps" } });
    expect(screen.queryByRole("button", { name: "Rift at 900, 1000" })).toBeNull();
    expect(screen.getByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Minedoor at 920, 1020" })).toBeNull();

    fireEvent.change(searchbox, { target: { value: "mine doors" } });
    expect(screen.queryByRole("button", { name: "Rift at 900, 1000" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeNull();
    expect(screen.getByRole("button", { name: "Minedoor at 920, 1020" })).toBeTruthy();
    expect(screen.getByTestId("minedoor-marker-minedoor-1").className).toContain("map-search-match");
  });

  it("keeps deed centers visible when overlays are hidden", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 500,
          y: 600
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Map settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Overlays" }));

    const deed = screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" });
    const center = screen.getByTestId("deed-center-deed-1");

    expect(screen.queryByTestId("deed-overlay-deed-1")).toBeNull();
    expect(deed).toBe(center);
    expect(deed.style.left).toBe("499px");
    expect(deed.style.top).toBe("599px");
    expect(deed.style.width).toBe("3px");
    expect(deed.style.height).toBe("3px");
    expect(center.style.left).toBe("499px");
    expect(center.style.top).toBe("599px");
    expect(center.style.width).toBe("3px");
    expect(center.style.height).toBe("3px");
  });

  it("does not open the old top-right details dialog when markers are clicked", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }));

    expect(screen.queryByRole("dialog", { name: "Note details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("opens edit and delete commands from an existing marker context menu", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 320,
      clientY: 330
    });

    const menu = screen.getByRole("menu", { name: "Marker actions" });
    expect(menu).toBeTruthy();
    expect(screen.getByText("1 item at 250, 300")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-tower-1")).toBeTruthy();
    expect(screen.getByText("Mako 945")).toBeTruthy();
    expect(screen.getByText("Tower | QL 89.50 | DMG 0.25")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-tower-1").style.getPropertyValue("--map-context-marker-color")).toBe("#ffffff");
    expect(window.location.href).toBe(`${window.location.origin}/map?x=250&y=300`);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    expect(screen.getByRole("dialog", { name: "Edit Tower" })).toBeTruthy();
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Mako 945");
  });

  it("lists every marker at the same coordinate from the marker context menu", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          east: 5,
          foundingDate: "2026-05-10",
          founder: "Mayor",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
          perimeter: 5,
          south: 5,
          type: "deed",
          west: 5,
          x: 250,
          y: 300
        },
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });

    const menu = screen.getByRole("menu", { name: "Marker actions" });
    expect(menu).toBeTruthy();
    expect(menu.querySelector(".map-context-marker-type")).toBeNull();
    expect(screen.getByText("3 items at 250, 300")).toBeTruthy();
    expect(screen.getByText("Mako 945")).toBeTruthy();
    expect(screen.getByText("Tower | QL 89.50 | DMG 0.25")).toBeTruthy();
    expect(screen.getByText("Oak Harbour")).toBeTruthy();
    expect(screen.getByText("Deed | Mayor Mayor | 11x11")).toBeTruthy();
    expect(screen.getByText("Scout note")).toBeTruthy();
    expect(screen.getByText("Note | General")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-tower-1").style.getPropertyValue("--map-context-marker-color")).toBe("#ffffff");
    expect(screen.getByTestId("context-marker-row-deed-1").style.getPropertyValue("--map-context-marker-color")).toBe("#facc15");
    expect(screen.getByTestId("context-marker-row-note-1").style.getPropertyValue("--map-context-marker-color")).toBe("#ff2bd6");
    expect(screen.queryByText("Edit Deed Oak Harbour")).toBeNull();
    expect(screen.queryByText("Delete Deed Oak Harbour")).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Deed Oak Harbour" }));

    expect(screen.getByRole("dialog", { name: "Edit Deed" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Oak Harbour");
    expect(screen.getByLabelText("Founding date")).toHaveProperty("value", "2026-05-10");
  });

  it("can add another marker at an occupied coordinate from the marker context menu", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          type: "tower",
          x: 250,
          y: 300
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Note" }));

    expect(screen.getByRole("dialog", { name: "Add note" })).toBeTruthy();
    expect(screen.getByLabelText("X")).toHaveProperty("value", "250");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "300");
  });

  it("deletes an existing marker from its context menu", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          category: "General",
          id: "note-1",
          text: "Scout here",
          title: "Scout note",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }), {
      clientX: 300,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Note General - Scout note" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/note/note-1",
      { method: "DELETE" }
    ));
    expect(screen.queryByRole("button", { name: "Note General - Scout note at 700, 800" })).toBeNull();
  });
});
