import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  name: "Wurm",
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
    expect(screen.getByRole("menuitem", { name: "Tower" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Deed" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeTruthy();
  });

  it("opens a coordinate link menu for read-only users without add commands", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

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
    expect(screen.getByRole("menuitem", { name: "Copy Link" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Tower" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Deed" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Note" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Copy Link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/map?x=125&y=140`));
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
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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
    expect(screen.getByLabelText("North")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("West")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("East")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("South")).toHaveProperty("value", "5");
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
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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

  it("moves map visibility and marker colors into the settings cog", () => {
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
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Overlays" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Deeds" }));

    expect(screen.queryByTestId("tower-protection-tower-1")).toBeNull();
    expect(screen.queryByTestId("tower-placement-tower-1")).toBeNull();
    expect(screen.queryByTestId("deed-overlay-deed-1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Tower color"), {
      target: { value: "#00ff00" }
    });
    fireEvent.change(screen.getByLabelText("Note color"), {
      target: { value: "#ff00ff" }
    });

    expect(screen.getByTestId("tower-center-tower-1").style.backgroundColor).toBe("rgb(0, 255, 0)");
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }).style.backgroundColor).toBe("rgb(255, 0, 255)");
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
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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

  it("keeps deed centers visible when overlays are hidden", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          founder: "Founder",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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

    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

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
          founder: "Mayor",
          id: "deed-1",
          name: "Oak Harbour",
          north: 5,
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

    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
    expect(screen.getByText("3 markers at 250, 300")).toBeTruthy();
    expect(screen.getByText("Tower Mako 945")).toBeTruthy();
    expect(screen.getByText("Deed Oak Harbour")).toBeTruthy();
    expect(screen.getByText("Note General - Scout note")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Deed Oak Harbour" }));

    expect(screen.getByRole("dialog", { name: "Edit Deed" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Oak Harbour");
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/note/note-1",
      { method: "DELETE" }
    ));
    expect(screen.queryByRole("button", { name: "Note General - Scout note at 700, 800" })).toBeNull();
  });
});
