import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_MAP_SETTINGS } from "@/lib/map-settings/map-settings";
import MapWorkspace from "./map-workspace";

const approvedViewer = {
  approvalStatus: "APPROVED",
  isAdmin: true,
  mapPermissions: [],
  pendingApprovalCount: 0,
  permissions: "WRITE",
  username: "Admin"
} as const;

const readOnlyViewer = {
  ...approvedViewer,
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "READ", isOperator: false, mapId: "map-1" }
  ],
  permissions: "READ"
} as const;

const writerViewer = {
  ...approvedViewer,
  isAdmin: false,
  mapPermissions: [
    { accessLevel: "WRITE", isOperator: false, mapId: "map-1" }
  ],
  permissions: "WRITE",
  username: "Writer"
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
  { color: null, id: "category-general", markerShape: "circle", name: "General", pipSize: 3 },
  { color: "#00ffaa", id: "category-landmarks", markerShape: "triangle", name: "Landmarks", pipSize: 6 }
] as const;

function mockClipboardWrite() {
  const writeText = vi.fn(async () => undefined);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });

  return writeText;
}

function getLayerControls() {
  return within(screen.getByRole("group", { name: "Map Layers" }));
}

function expandLayerCategory(label: string) {
  const layerControls = getLayerControls();
  const category = layerControls.getByRole("button", { name: label });

  if (category.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(category);
  }

  return getLayerControls();
}

function expandAllLayerCategories() {
  ["Markers", "Roadways", "Misc"].forEach((label) => expandLayerCategory(label));

  return getLayerControls();
}

function expandNoteCategories() {
  const categoryControls = within(screen.getByRole("group", { name: "Note Categories" }));
  const toggle = categoryControls.getByRole("button", { name: "Note Categories" });

  if (toggle.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(toggle);
  }

  return categoryControls;
}

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
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search map" })).toBeTruthy();
  });

  it("renders an unobtrusive support link for hosting and development costs", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const supportLink = screen.getByRole("link", { name: "support me and hosting/development costs" });

    expect(supportLink.getAttribute("href")).toBe("https://ko-fi.com/poindexter8085");
    expect(supportLink.getAttribute("target")).toBe("_blank");
    expect(supportLink.getAttribute("rel")).toBe("noreferrer");
  });

  it("cycles footer tips automatically and by click", () => {
    vi.useFakeTimers();

    try {
      render(React.createElement(MapWorkspace, {
        initialMarkers: [],
        initialNoteCategories: noteCategories,
        map: activeMap,
        viewer: approvedViewer
      }));

      expect(screen.getByText("Tip: You can quick-plan deeds by holding down shift and click-dragging a box of whatever size.")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(15000);
      });

      expect(screen.getByText("Tip: You can quick-plan towers by opening an existing tower, checking the \"Planned\" box, and clicking around while holding down the CTRL key.")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Tip:/ }));

      expect(screen.getByText("Tip: All colours and opacities can be configured in the settings cogwheel in the top right.")).toBeTruthy();

      for (let index = 0; index < 3; index += 1) {
        fireEvent.click(screen.getByRole("button", { name: /Tip:/ }));
      }

      expect(screen.getByText("Tip: Did you know you can shift-click and drag while in the edit menu of a deed to quick resize it?")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Tip:/ }));

      expect(screen.getByText("Tip: Note settings are all user specific. The only thing that is shared are category names.")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Tip:/ }));

      expect(screen.getByText("Tip: You can use the Quick Input field on new towers to paste a log directly from Wurm and have the information auto-fill.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows account permissions without the status row", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    const accountDialog = screen.getByRole("dialog", { name: "Account settings" });
    const permissionsGroup = within(accountDialog).getByRole("group", { name: "Permissions" });

    expect(within(accountDialog).queryByText("Status")).toBeNull();
    expect(within(permissionsGroup).getByText("Global")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Admin")).toBeTruthy();
    expect(within(permissionsGroup).queryByText("Celebration")).toBeNull();
    expect(within(permissionsGroup).queryByText("Read")).toBeNull();
    expect(within(permissionsGroup).queryByText("Denied")).toBeNull();
    expect(within(accountDialog).getByText("Project Huginn - v1.3.0")).toBeTruthy();
  });

  it("shows only read access for read-only users", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: readOnlyViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    const permissionsGroup = within(screen.getByRole("dialog", { name: "Account settings" }))
      .getByRole("group", { name: "Permissions" });

    expect(within(permissionsGroup).getByText("Global")).toBeTruthy();
    expect(within(permissionsGroup).getByText("Read")).toBeTruthy();
    expect(within(permissionsGroup).queryByText("Celebration")).toBeNull();
    expect(within(permissionsGroup).queryByText("Read/Write")).toBeNull();
    expect(within(permissionsGroup).queryByText("Admin")).toBeNull();
    expect(within(permissionsGroup).queryByText("Denied")).toBeNull();
  });

  it("keeps the Celebration event feed minimized until the events button is opened", () => {
    render(React.createElement(MapWorkspace, {
      initialEventFeed: {
        events: Array.from({ length: 35 }, (_, index) => ({
          id: `event-${index}`,
          kind: "deed" as const,
          label: "Deed",
          message: `Celebration event ${index}`,
          subtype: 1,
          timestamp: 1778286000 + index
        })),
        fetchedAt: "2026-05-13T04:00:00.000Z",
        serverStatus: {
          status: "online",
          uptimeSeconds: 53207,
          weather: "A light breeze is coming from the south.",
          wurmTime: "It is 18:30:03 on day of Awakening."
        },
        sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
      },
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const controls = screen.getByTestId("map-bottom-left-controls");
    expect(Array.from(controls.children).map((child) => child.className)).toEqual([
      "map-legend-control",
      "map-route-planner-control",
      "map-event-feed-control",
      "map-share-control"
    ]);

    expect(screen.queryByRole("dialog", { name: "Celebration event feed" })).toBeNull();

    const eventsButton = screen.getByRole("button", { name: "Celebration events" });
    expect(eventsButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(eventsButton);

    expect(eventsButton.getAttribute("aria-expanded")).toBe("true");
    const feed = screen.getByRole("dialog", { name: "Celebration event feed" });
    expect(within(feed).getByText("Celebration Events")).toBeTruthy();
    expect(within(feed).getByText("Online")).toBeTruthy();
    expect(within(feed).getAllByRole("listitem")).toHaveLength(30);
    expect(within(feed).getByText("Celebration event 34")).toBeTruthy();
    expect(within(feed).queryByText("Celebration event 4")).toBeNull();
  });

  it("loads the event feed from the map events API when opened without initial feed data", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      feed: {
        events: [
          {
            id: "event-1",
            kind: "deed",
            label: "Deed",
            message: "Celebration event loaded from API",
            subtype: 1,
            timestamp: 1778286000
          }
        ],
        fetchedAt: "2026-05-13T04:00:00.000Z",
        serverStatus: {
          status: "online",
          uptimeSeconds: 53207,
          weather: "A light breeze is coming from the south.",
          wurmTime: "It is 18:30:03 on day of Awakening."
        },
        sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Celebration events" }));

    expect(screen.getByText("Loading events")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/maps/map-1/events"));
    expect(await screen.findByText("Celebration event loaded from API")).toBeTruthy();
  });

  it("renders saved event feed size and saves resize changes", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialEventFeed: {
        events: Array.from({ length: 8 }, (_, index) => ({
          id: `event-${index}`,
          kind: "deed" as const,
          label: "Deed",
          message: `Celebration event ${index}`,
          subtype: 1,
          timestamp: 1778286000 + index
        })),
        fetchedAt: "2026-05-13T04:00:00.000Z",
        serverStatus: {
          status: "online",
          uptimeSeconds: 53207,
          weather: "A light breeze is coming from the south.",
          wurmTime: "It is 18:30:03 on day of Awakening."
        },
        sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
      },
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        eventFeedPanelSize: {
          height: 300,
          width: 460
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Celebration events" }));

    const feed = screen.getByRole("dialog", { name: "Celebration event feed" });
    expect(feed.style.width).toBe("460px");
    expect(feed.style.height).toBe("300px");

    fireEvent.pointerDown(screen.getByTestId("event-feed-resize-handle-bottom-right"), {
      button: 0,
      clientX: 200,
      clientY: 300,
      pointerId: 31
    });
    fireEvent.pointerMove(window, {
      clientX: 260,
      clientY: 345,
      pointerId: 31
    });
    fireEvent.pointerUp(window, { pointerId: 31 });

    expect(feed.style.width).toBe("520px");
    expect(feed.style.height).toBe("345px");

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
      eventFeedPanelSize: {
        height: 345,
        width: 520
      }
    });
  });

  it("resizes the event feed from a top corner while bottom-aligned", () => {
    render(React.createElement(MapWorkspace, {
      initialEventFeed: {
        events: Array.from({ length: 8 }, (_, index) => ({
          id: `event-${index}`,
          kind: "deed" as const,
          label: "Deed",
          message: `Celebration event ${index}`,
          subtype: 1,
          timestamp: 1778286000 + index
        })),
        fetchedAt: "2026-05-13T04:00:00.000Z",
        serverStatus: {
          status: "online",
          uptimeSeconds: 53207,
          weather: "A light breeze is coming from the south.",
          wurmTime: "It is 18:30:03 on day of Awakening."
        },
        sourceUrl: "https://wurmmaps.xyz/APIs/stat-delegate.php?map=celebration"
      },
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        eventFeedPanelSize: {
          height: 300,
          width: 460
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Celebration events" }));

    const feed = screen.getByRole("dialog", { name: "Celebration event feed" });
    expect(feed.style.width).toBe("460px");
    expect(feed.style.height).toBe("300px");

    fireEvent.pointerDown(screen.getByTestId("event-feed-resize-handle-top-left"), {
      button: 0,
      clientX: 200,
      clientY: 300,
      pointerId: 32
    });
    fireEvent.pointerMove(window, {
      clientX: 160,
      clientY: 245,
      pointerId: 32
    });
    fireEvent.pointerUp(window, { pointerId: 32 });

    expect(feed.style.width).toBe("500px");
    expect(feed.style.height).toBe("355px");
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
          planned: true,
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

    expect(screen.getByRole("combobox", { name: "Server" }).textContent).toContain("Celebration");
    fireEvent.click(screen.getByRole("combobox", { name: "Server" }));
    expect(screen.getByRole("menuitem", { name: "Celebration" })).toBeTruthy();

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

  it("groups server choices by cluster and alphabetizes each cluster", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      servers: [
        { id: "map-xanadu", name: "Xanadu" },
        { id: "map-cadence", name: "Cadence" },
        { id: "map-elevation", name: "Elevation" },
        { id: "map-celebration", name: "Celebration" },
        { id: "map-affliction", name: "Affliction" },
        { id: "map-harmony", name: "Harmony" }
      ],
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("combobox", { name: "Server" }));

    const serverMenu = screen.getByRole("menu", { name: "Server choices" });
    const groups = within(serverMenu).getAllByRole("group");

    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Epic",
      "Northern Freedom Isles",
      "Southern Freedom Isles"
    ]);
    expect(within(groups[0] as HTMLElement).getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Affliction",
      "Elevation"
    ]);
    expect(within(groups[1] as HTMLElement).getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Cadence",
      "Harmony"
    ]);
    expect(within(groups[2] as HTMLElement).getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Celebration",
      "Xanadu"
    ]);
  });

  it("shows a favorite server at the top while keeping it in its cluster", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        favoriteServerId: "map-harmony"
      },
      map: activeMap,
      servers: [
        { id: "map-cadence", name: "Cadence" },
        { id: "map-harmony", name: "Harmony" },
        { id: "map-celebration", name: "Celebration" }
      ],
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("combobox", { name: "Server" }));

    const serverMenu = screen.getByRole("menu", { name: "Server choices" });
    const groups = within(serverMenu).getAllByRole("group");

    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Favorite",
      "Northern Freedom Isles",
      "Southern Freedom Isles"
    ]);
    expect(within(groups[0] as HTMLElement).getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Harmony"
    ]);
    expect(within(groups[1] as HTMLElement).getAllByRole("menuitem").map((option) => option.textContent)).toEqual([
      "Cadence",
      "Harmony"
    ]);
  });

  it("saves the selected server as the single favorite server setting", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({}),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      servers: [
        { id: "map-1", name: "Celebration" },
        { id: "map-harmony", name: "Harmony" }
      ],
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("combobox", { name: "Server" }));
    fireEvent.click(screen.getByRole("button", { name: "Set Celebration as favorite server" }));

    expect(screen.getAllByRole("button", { name: "Remove favorite server Celebration" })[0]?.getAttribute("aria-pressed")).toBe("true");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));

    const settingsCall = (fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>)
      .find(([url]) => url === "/api/maps/map-1/settings");
    const settingsBody = JSON.parse(String(settingsCall?.[1]?.body));
    expect(settingsBody.favoriteServerId).toBe("map-1");
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

  it("zooms the map with a two finger pinch gesture", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    const viewport = screen.getByLabelText("Map image area");
    const stage = screen.getByTestId("map-stage");

    expect(stage.dataset.zoom).toBe("1");

    fireEvent.pointerDown(viewport, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 101,
      pointerType: "touch"
    });
    fireEvent.pointerDown(viewport, {
      button: 0,
      clientX: 200,
      clientY: 100,
      pointerId: 102,
      pointerType: "touch"
    });
    fireEvent.pointerMove(window, {
      clientX: 50,
      clientY: 100,
      pointerId: 101,
      pointerType: "touch"
    });
    fireEvent.pointerMove(window, {
      clientX: 250,
      clientY: 100,
      pointerId: 102,
      pointerType: "touch"
    });

    await waitFor(() => {
      expect(Number(stage.dataset.zoom)).toBeGreaterThan(1);
    });

    fireEvent.pointerUp(window, { pointerId: 101, pointerType: "touch" });
    fireEvent.pointerUp(window, { pointerId: 102, pointerType: "touch" });
  });

  it("opens map actions from a touch long press", () => {
    vi.useFakeTimers();

    try {
      render(React.createElement(MapWorkspace, {
        initialMarkers: [],
        initialNoteCategories: noteCategories,
        map: activeMap,
        viewer: approvedViewer
      }));

      const viewport = screen.getByLabelText("Map image area");

      fireEvent.pointerDown(viewport, {
        button: 0,
        clientX: 420,
        clientY: 520,
        pointerId: 201,
        pointerType: "touch"
      });
      act(() => {
        vi.advanceTimersByTime(650);
      });

      const menu = screen.getByRole("menu", { name: "Map actions" });
      expect(within(menu).getByRole("menuitem", { name: "Tower" })).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: "Copy link to 420, 520" })).toBeTruthy();

      fireEvent.pointerUp(window, { pointerId: 201, pointerType: "touch" });
    } finally {
      vi.useRealTimers();
    }
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
    expect(mapImage.style.width).toBe("2048px");
    expect(mapImage.style.height).toBe("2048px");
    expect(mapImage.style.transform).toContain("scale(0.5)");
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
          lastModifiedBy: "Sam",
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

  it("keeps the map image and marker layer aligned during a pan before the next render", async () => {
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
    const mapImage = screen.getByAltText("Wurm Online map");
    const markerWorld = screen.getByTestId("map-marker-layer").parentElement as HTMLDivElement;

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

    expect(stage.style.transform).toBe("translate(40px, 25px) scale(1)");
    expect(mapImage.style.transform).toBe("translate3d(40px, 25px, 0) scale(1)");
    expect(markerWorld.style.transform).toBe("translate3d(40px, 25px, 0) scale(1)");

    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(40px, 25px) scale(1)")
    );
  });

  it("supports dragging the map to pan from marker overlays", async () => {
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

    const stage = screen.getByTestId("map-stage");
    const deedOverlay = screen.getByTestId("deed-overlay-deed-1");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.pointerDown(deedOverlay, {
      button: 0,
      clientX: 500,
      clientY: 600,
      pointerId: 91
    });
    fireEvent.pointerMove(window, {
      clientX: 545,
      clientY: 625,
      pointerId: 91
    });
    fireEvent.pointerUp(window, { pointerId: 91 });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(45px, 25px) scale(1)")
    );
  });

  it("supports dragging the map to pan from marker pips", async () => {
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
    const towerPip = screen.getByTestId("tower-center-tower-1");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.pointerDown(towerPip, {
      button: 0,
      clientX: 250,
      clientY: 300,
      pointerId: 92
    });
    fireEvent.pointerMove(window, {
      clientX: 290,
      clientY: 330,
      pointerId: 92
    });
    fireEvent.pointerUp(window, { pointerId: 92 });

    await waitFor(() =>
      expect(stage.style.transform).toBe("translate(40px, 30px) scale(1)")
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
    const clipboardWrite = mockClipboardWrite();

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
    expect(window.location.href).toBe(`${window.location.origin}/map?server=1&x=125&y=140`);
    const coordinateCopyButton = screen.getByRole("menuitem", { name: "Copy link to 125, 140" });
    expect(screen.getByText("125, 140").closest("button")).toBe(coordinateCopyButton);
    expect(coordinateCopyButton.querySelector(".map-context-coordinate-icon")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Copy coordinates 125, 140" })).toBeNull();
    fireEvent.click(coordinateCopyButton);
    expect(clipboardWrite).toHaveBeenLastCalledWith(`${window.location.origin}/map?server=1&x=125&y=140`);
    expect(screen.getByRole("menuitem", { name: "Annotation" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Tower" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Deed" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Note" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Roadways" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("menuitem", { name: "Misc" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem", { name: "Bridge" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Canal" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Highway" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Rift" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Camp" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Minedoor" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Locate Soul" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Roadways" }));
    expect(screen.getByRole("menu", { name: "Roadways" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Bridge" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Canal" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Highway" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Tunnel" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
    expect(screen.getByRole("menu", { name: "Misc" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rift" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Camp" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Minedoor" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Locate Soul" })).toBeTruthy();
  });

  it("keeps context menus inside narrow viewport edges", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844
    });

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(Number(stage.dataset.zoom)).toBeLessThan(1));

    fireEvent.contextMenu(stage, {
      clientX: 382,
      clientY: 612
    });

    const menu = screen.getByRole("menu", { name: "Map actions" });
    expect(menu.style.left).toBe("38px");
    expect(menu.style.top).toBe("412px");
  });

  it("updates the browser URL for read-only map context with coordinate copying only", async () => {
    const clipboardWrite = mockClipboardWrite();

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
    expect(window.location.href).toBe(`${window.location.origin}/map?server=1&x=125&y=140`);
    const coordinateCopyButton = screen.getByRole("menuitem", { name: "Copy link to 125, 140" });
    expect(screen.getByText("125, 140").closest("button")).toBe(coordinateCopyButton);
    expect(coordinateCopyButton.querySelector(".map-context-coordinate-icon")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Copy coordinates 125, 140" })).toBeNull();
    fireEvent.click(coordinateCopyButton);
    expect(clipboardWrite).toHaveBeenLastCalledWith(`${window.location.origin}/map?server=1&x=125&y=140`);
    expect(screen.queryByRole("menuitem", { name: "Tower" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Deed" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Note" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Roadways" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Misc" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Rift" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Camp" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Minedoor" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Locate Soul" })).toBeNull();
  });

  it("copies a coordinate link that includes the current server when the URL has no server", async () => {
    const clipboardWrite = mockClipboardWrite();

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        favoriteServerId: "map-1"
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.contextMenu(stage, {
      clientX: 125,
      clientY: 140
    });

    const coordinateCopyButton = screen.getByRole("menuitem", { name: "Copy link to 125, 140" });
    fireEvent.click(coordinateCopyButton);
    expect(clipboardWrite).toHaveBeenLastCalledWith(`${window.location.origin}/map?server=1&x=125&y=140`);
  });

  it("renders square marker overlays and tower centers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          planned: true,
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
        },
        {
          casterFacing: "north",
          direction: "aheadLeft",
          distanceBand: "50-199",
          id: "locate-soul-1",
          notes: "Corpse result",
          targetName: "Funkiey",
          type: "locateSoul",
          x: 930,
          y: 1030
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
    expect(innerTowerOverlay.style.getPropertyValue("--map-tower-zone-gradient")).toBe("");
    expect(innerTowerOverlay.className).toContain("is-planned");
    expect(innerTowerOverlay.style.backgroundImage).toContain("rgba(255, 255, 255, 0.18)");
    expect(innerTowerOverlay.style.backgroundImage).toContain("transparent 8px");
    expect(innerTowerOverlay.style.backgroundImage).not.toContain("rgba(15, 23, 42, 0.72)");
    expect(outerTowerOverlay.style.left).toBe("200px");
    expect(outerTowerOverlay.style.top).toBe("250px");
    expect(outerTowerOverlay.style.width).toBe("101px");
    expect(outerTowerOverlay.style.height).toBe("101px");
    const innerTowerBorderTop = screen.getByTestId("tower-protection-border-top-tower-1");
    expect(innerTowerBorderTop.className).toContain("is-planned");
    expect(innerTowerBorderTop.style.backgroundImage).toContain("linear-gradient(135deg");
    expect(innerTowerBorderTop.style.backgroundImage).toContain("8px");
    expect(innerTowerBorderTop.style.backgroundImage).toContain("16px");
    expect(innerTowerBorderTop.style.left).toBe("225px");
    expect(innerTowerBorderTop.style.top).toBe("275px");
    expect(innerTowerBorderTop.style.width).toBe("51px");
    expect(innerTowerBorderTop.style.height).toBe("1px");
    expect(innerTowerBorderTop.style.backgroundColor).toBe("rgb(255, 255, 255)");
    const innerTowerBorderBottom = screen.getByTestId("tower-protection-border-bottom-tower-1");
    expect(innerTowerBorderBottom.style.left).toBe("225px");
    expect(innerTowerBorderBottom.style.top).toBe("325px");
    expect(innerTowerBorderBottom.style.width).toBe("51px");
    expect(innerTowerBorderBottom.style.height).toBe("1px");
    const innerTowerBorderLeft = screen.getByTestId("tower-protection-border-left-tower-1");
    expect(innerTowerBorderLeft.style.left).toBe("225px");
    expect(innerTowerBorderLeft.style.top).toBe("275px");
    expect(innerTowerBorderLeft.style.width).toBe("1px");
    expect(innerTowerBorderLeft.style.height).toBe("51px");
    const innerTowerBorderRight = screen.getByTestId("tower-protection-border-right-tower-1");
    expect(innerTowerBorderRight.style.left).toBe("275px");
    expect(innerTowerBorderRight.style.top).toBe("275px");
    expect(innerTowerBorderRight.style.width).toBe("1px");
    expect(innerTowerBorderRight.style.height).toBe("51px");
    const outerTowerBorderTop = screen.getByTestId("tower-placement-border-top-tower-1");
    expect(outerTowerBorderTop.style.left).toBe("200.25px");
    expect(outerTowerBorderTop.style.top).toBe("250.25px");
    expect(outerTowerBorderTop.style.width).toBe("100.5px");
    expect(outerTowerBorderTop.style.height).toBe("0.5px");
    expect(outerTowerBorderTop.style.backgroundColor).toBe("rgb(255, 255, 255)");
    const outerTowerBorderBottom = screen.getByTestId("tower-placement-border-bottom-tower-1");
    expect(outerTowerBorderBottom.style.left).toBe("200.25px");
    expect(outerTowerBorderBottom.style.top).toBe("350.25px");
    expect(outerTowerBorderBottom.style.width).toBe("100.5px");
    expect(outerTowerBorderBottom.style.height).toBe("0.5px");
    const outerTowerBorderLeft = screen.getByTestId("tower-placement-border-left-tower-1");
    expect(outerTowerBorderLeft.style.left).toBe("200.25px");
    expect(outerTowerBorderLeft.style.top).toBe("250.25px");
    expect(outerTowerBorderLeft.style.width).toBe("0.5px");
    expect(outerTowerBorderLeft.style.height).toBe("100.5px");
    const outerTowerBorderRight = screen.getByTestId("tower-placement-border-right-tower-1");
    expect(outerTowerBorderRight.style.left).toBe("300.25px");
    expect(outerTowerBorderRight.style.top).toBe("250.25px");
    expect(outerTowerBorderRight.style.width).toBe("0.5px");
    expect(outerTowerBorderRight.style.height).toBe("100.5px");
    expect(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeTruthy();
    const deedOverlay = screen.getByTestId("deed-overlay-deed-1");
    expect(deedOverlay.style.left).toBe("494px");
    expect(deedOverlay.style.top).toBe("595px");
    expect(deedOverlay.style.width).toBe("14px");
    expect(deedOverlay.style.height).toBe("14px");
    expect(deedOverlay.style.backgroundColor).toBe("");
    const deedBorderTop = screen.getByTestId("deed-border-top-deed-1");
    expect(deedBorderTop.style.left).toBe("494px");
    expect(deedBorderTop.style.top).toBe("595px");
    expect(deedBorderTop.style.width).toBe("14px");
    expect(deedBorderTop.style.height).toBe("1px");
    expect(deedBorderTop.style.backgroundColor).toBe("rgb(250, 204, 21)");
    const deedBorderBottom = screen.getByTestId("deed-border-bottom-deed-1");
    expect(deedBorderBottom.style.left).toBe("494px");
    expect(deedBorderBottom.style.top).toBe("608px");
    expect(deedBorderBottom.style.width).toBe("14px");
    expect(deedBorderBottom.style.height).toBe("1px");
    const deedBorderLeft = screen.getByTestId("deed-border-left-deed-1");
    expect(deedBorderLeft.style.left).toBe("494px");
    expect(deedBorderLeft.style.top).toBe("595px");
    expect(deedBorderLeft.style.width).toBe("1px");
    expect(deedBorderLeft.style.height).toBe("14px");
    const deedBorderRight = screen.getByTestId("deed-border-right-deed-1");
    expect(deedBorderRight.style.left).toBe("507px");
    expect(deedBorderRight.style.top).toBe("595px");
    expect(deedBorderRight.style.width).toBe("1px");
    expect(deedBorderRight.style.height).toBe("14px");
    const perimeterTop = screen.getByTestId("deed-perimeter-top-deed-1");
    expect(perimeterTop.style.left).toBe("484.25px");
    expect(perimeterTop.style.top).toBe("585.25px");
    expect(perimeterTop.style.width).toBe("33.5px");
    expect(perimeterTop.style.height).toBe("0.5px");
    expect(perimeterTop.style.backgroundColor).toBe("rgb(250, 204, 21)");
    const perimeterBottom = screen.getByTestId("deed-perimeter-bottom-deed-1");
    expect(perimeterBottom.style.left).toBe("484.25px");
    expect(perimeterBottom.style.top).toBe("618.25px");
    expect(perimeterBottom.style.width).toBe("33.5px");
    expect(perimeterBottom.style.height).toBe("0.5px");
    expect(perimeterBottom.style.backgroundColor).toBe("rgb(250, 204, 21)");
    const perimeterLeft = screen.getByTestId("deed-perimeter-left-deed-1");
    expect(perimeterLeft.style.left).toBe("484.25px");
    expect(perimeterLeft.style.top).toBe("585.25px");
    expect(perimeterLeft.style.width).toBe("0.5px");
    expect(perimeterLeft.style.height).toBe("33.5px");
    expect(perimeterLeft.style.backgroundColor).toBe("rgb(250, 204, 21)");
    const perimeterRight = screen.getByTestId("deed-perimeter-right-deed-1");
    expect(perimeterRight.style.left).toBe("517.25px");
    expect(perimeterRight.style.top).toBe("585.25px");
    expect(perimeterRight.style.width).toBe("0.5px");
    expect(perimeterRight.style.height).toBe("33.5px");
    expect(perimeterRight.style.backgroundColor).toBe("rgb(250, 204, 21)");
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
    const riftOverlay = screen.getByTestId("rift-overlay-rift-1");
    expect(riftOverlay.style.left).toBe("875px");
    expect(riftOverlay.style.top).toBe("975px");
    expect(riftOverlay.style.width).toBe("51px");
    expect(riftOverlay.style.height).toBe("51px");
    expect(riftOverlay.style.backgroundColor).toBe("");
    expect(riftOverlay.style.opacity).toBe("1");
    const riftBorderTop = screen.getByTestId("rift-overlay-border-top-rift-1");
    expect(riftBorderTop.style.left).toBe("875px");
    expect(riftBorderTop.style.top).toBe("975px");
    expect(riftBorderTop.style.width).toBe("51px");
    expect(riftBorderTop.style.height).toBe("1px");
    expect(riftBorderTop.style.backgroundColor).toBe("rgb(239, 68, 68)");
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
    const locateSoul = screen.getByRole("button", { name: "Locate Soul Funkiey at 930, 1030" });
    expect(locateSoul.style.left).toBe("926px");
    expect(locateSoul.style.top).toBe("1026px");
    expect(locateSoul.style.width).toBe("9px");
    expect(locateSoul.style.height).toBe("9px");
    expect(locateSoul.style.opacity).toBe("1");
    expect(locateSoul.className).toContain("map-marker--locate-soul");
    const locateSoulOverlay = screen.getByTestId("locate-soul-overlay-locate-soul-1");
    expect(locateSoulOverlay.getAttribute("fill")).toBe(DEFAULT_USER_MAP_SETTINGS.markerColors.locateSouls);
    expect(locateSoulOverlay.getAttribute("opacity")).toBe("0.5");
    expect(locateSoulOverlay.getAttribute("d")).toContain("M ");
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

  it("opens a deed create form from shift-dragged map bounds", async () => {
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
      clientY: 200,
      pointerId: 91,
      shiftKey: true
    });
    fireEvent.pointerMove(window, {
      clientX: 110,
      clientY: 214,
      pointerId: 91,
      shiftKey: true
    });

    const draft = screen.getByTestId("quick-deed-draft");
    expect(draft.style.left).toBe("100px");
    expect(draft.style.top).toBe("200px");
    expect(draft.style.width).toBe("11px");
    expect(draft.style.height).toBe("15px");

    fireEvent.pointerUp(window, {
      clientX: 110,
      clientY: 214,
      pointerId: 91
    });

    const persistedDraft = screen.getByTestId("quick-deed-draft");
    expect(persistedDraft.style.width).toBe("11px");
    expect(persistedDraft.style.height).toBe("15px");
    expect(screen.getByRole("dialog", { name: "Add deed" })).toBeTruthy();
    expect(screen.getByLabelText("X")).toHaveProperty("value", "105");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "207");
    expect(screen.getByLabelText("North")).toHaveProperty("value", "7");
    expect(screen.getByLabelText("West")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("East")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("South")).toHaveProperty("value", "7");
    expect(screen.getByLabelText("Perimeter")).toHaveProperty("value", "5");
    expect(window.location.href).toBe(`${window.location.origin}/map?server=1&x=105&y=207`);

    fireEvent.click(screen.getByRole("button", { name: "Close marker dialog" }));

    expect(screen.queryByTestId("quick-deed-draft")).toBeNull();
  });

  it("opens a quick deed create form when shift-dragging over marker overlays", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          lastModifiedBy: "Kichi",
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

    await waitFor(() => expect(screen.getByTestId("map-stage").dataset.zoom).toBe("1"));

    const deedOverlay = screen.getByTestId("deed-overlay-deed-1");
    fireEvent.pointerDown(deedOverlay, {
      button: 0,
      clientX: 498,
      clientY: 598,
      pointerId: 92,
      shiftKey: true
    });
    fireEvent.pointerMove(window, {
      clientX: 508,
      clientY: 606,
      pointerId: 92,
      shiftKey: true
    });
    fireEvent.pointerUp(window, {
      clientX: 508,
      clientY: 606,
      pointerId: 92
    });

    expect(screen.getByRole("dialog", { name: "Add deed" })).toBeTruthy();
    expect(screen.getByLabelText("X")).toHaveProperty("value", "503");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "602");
    expect(screen.getByLabelText("North")).toHaveProperty("value", "4");
    expect(screen.getByLabelText("West")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("East")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("South")).toHaveProperty("value", "4");
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
    expect(screen.getByLabelText("QL")).toHaveProperty("value", "");
    expect(screen.getByLabelText("QL").hasAttribute("required")).toBe(false);
    expect(screen.getByLabelText("Damage")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Damage").hasAttribute("required")).toBe(false);
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Creator").hasAttribute("required")).toBe(false);
    expect(screen.getByLabelText("Quick Input")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Tower type")).toHaveProperty("value", "Freedom Isles");
    expect(within(screen.getByLabelText("Tower type")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Freedom Isles",
      "Horde of the Summoned",
      "Jenn-Kellon",
      "Mol-Rehan"
    ]);
    fireEvent.change(screen.getByLabelText("QL"), { target: { value: "72.13" } });
    fireEvent.change(screen.getByLabelText("Damage"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByLabelText("Creator"), { target: { value: "Mako 945" } });
    expect(screen.getByLabelText("QL")).toHaveProperty("value", "72.13");
    expect(screen.getByLabelText("Damage")).toHaveProperty("value", "0.25");
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Mako 945");
    fireEvent.change(screen.getByLabelText("Quick Input"), {
      target: {
        value: "[20:34:20] A high guard tower. The guard tower has some irregularities that must be removed with a stone chisel. Ql: 63.42072, Dam: 0.0. The name of the founder, Stargrace, has been carved into the stone above the door. 'Stargrace 490' is engraved in a metal plaque on the door."
      }
    });
    expect(screen.getByLabelText("QL")).toHaveProperty("value", "63.42");
    expect(screen.getByLabelText("Damage")).toHaveProperty("value", "0.0");
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Stargrace 490");
    expect(screen.getByLabelText("Tower type")).toHaveProperty("value", "Freedom Isles");
    expect(screen.queryByLabelText("Creator name")).toBeNull();
    expect(screen.queryByLabelText("Creator number")).toBeNull();
  });

  it("opens a note create form with title and category dropdown", async () => {
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
    expect(screen.getByLabelText("Text").hasAttribute("required")).toBe(false);
    expect(screen.getByRole("option", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Landmarks" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add note category" })).toBeNull();
  });

  it("stores annotations in per-user map settings instead of shared marker APIs", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({}),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        randomUUID: vi.fn(() => "annotation-id")
      }
    });

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
    fireEvent.click(screen.getByRole("menuitem", { name: "Annotation" }));

    const dialog = screen.getByRole("dialog", { name: "Add annotation" });
    expect(dialog.className).toContain("map-marker-dialog");
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Text")).toHaveProperty("value", "");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Private waypoint" }
    });
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "Personal reminder" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Annotation Private waypoint at 125, 140" })).toBeTruthy();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/maps/map-1/markers",
      expect.objectContaining({ method: "POST" })
    );
    const settingsCall = (fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>)
      .find(([url]) => url === "/api/maps/map-1/settings");
    const settingsBody = JSON.parse(String((settingsCall?.[1] as RequestInit | undefined)?.body));
    expect(settingsBody.annotations).toEqual([
      {
        id: "annotation-annotation-id",
        text: "Personal reminder",
        title: "Private waypoint",
        type: "annotation",
        x: 125,
        y: 140
      }
    ]);
  });

  it("saves notes without text", async () => {
    const savedNote = {
      category: "General",
      id: "note-1",
      text: "",
      title: "Mine entrance",
      type: "note",
      x: 125,
      y: 140
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: savedNote }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Mine entrance" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
      category: "General",
      text: "",
      title: "Mine entrance",
      type: "note",
      x: 125,
      y: 140
    });
    expect(screen.getByRole("button", { name: "Note General - Mine entrance at 125, 140" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rift" }));

    expect(screen.getByRole("dialog", { name: "Add rift" })).toBeTruthy();
    expect(screen.getByLabelText("Date of arrival")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Estimated rift time")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Notes")).toHaveProperty("value", "");
  });

  it("opens a locate soul create form with caster facing and pasted output fields", async () => {
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Locate Soul" }));

    expect(screen.getByRole("dialog", { name: "Add locate soul" })).toBeTruthy();
    expect(screen.getByLabelText("Caster Facing")).toHaveProperty("value", "north");
    expect(screen.getByLabelText("Locate Soul Output")).toHaveProperty("value", "");
    expect(screen.queryByLabelText("Target")).toBeNull();
    expect(screen.queryByLabelText("Direction")).toBeNull();
    expect(screen.queryByLabelText("Distance")).toBeNull();
    expect(screen.queryByLabelText("Notes")).toBeNull();
  });

  it("saves locate soul casts by parsing pasted event output", async () => {
    const savedLocateSoul = {
      casterFacing: "east",
      direction: "behindRight",
      distanceBand: "2000+",
      id: "locate-soul-1",
      notes: "",
      targetName: "Itsumo",
      type: "locateSoul",
      x: 125,
      y: 140
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: savedLocateSoul }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Locate Soul" }));
    fireEvent.change(screen.getByLabelText("Caster Facing"), {
      target: { value: "east" }
    });
    fireEvent.change(screen.getByLabelText("Locate Soul Output"), {
      target: {
        value: `[01:31:23] You cast Locate Soul.
[01:31:24] No such soul found.
[01:31:24] Corpse of Itsumo is very far away behind you to the right.`
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
      casterFacing: "east",
      direction: "behindRight",
      distanceBand: "2000+",
      notes: "",
      targetName: "Itsumo",
      type: "locateSoul",
      x: 125,
      y: 140
    });
    expect(screen.getByRole("button", { name: "Locate Soul Itsumo at 125, 140" })).toBeTruthy();
  });

  it("renders an off-map direction indicator when a locate soul shadow has no visible tiles", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          casterFacing: "north",
          direction: "behindRight",
          distanceBand: "2000+",
          id: "locate-soul-off-map",
          notes: "",
          targetName: "Itsumo",
          type: "locateSoul",
          x: 1092,
          y: 703
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByRole("button", { name: "Locate Soul Itsumo at 1092, 703" })).toBeTruthy();
    expect(screen.queryByTestId("locate-soul-overlay-locate-soul-off-map")).toBeNull();
    const offMapIndicator = screen.getByTestId("locate-soul-off-map-locate-soul-off-map");
    expect(offMapIndicator.getAttribute("stroke")).toBe(DEFAULT_USER_MAP_SETTINGS.markerColors.locateSouls);
    expect(offMapIndicator.getAttribute("opacity")).toBe("0.5");
    expect(offMapIndicator.getAttribute("stroke-dasharray")).toBe("8 6");
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Misc" }));
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
      viewer: writerViewer
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

  it("hides note category creation from the note form for admins", async () => {
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

    expect(screen.queryByRole("button", { name: "Add note category" })).toBeNull();
    expect(screen.queryByLabelText("New category")).toBeNull();
  });

  it("shows cursor-following dark hover details instead of inline hover cards", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          lastModifiedBy: "Sam",
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
          lastModifiedBy: "Kichi",
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

    const towerDetails = screen.getByRole("tooltip", { name: "Map items at 320, 330" });
    expect(towerDetails.className).toContain("map-hover-details");
    expect(towerDetails.style.left).toBe("334px");
    expect(towerDetails.style.top).toBe("344px");
    expect(screen.getByText("Map items at 320, 330")).toBeTruthy();
    const towerPill = within(towerDetails).getByTestId("hover-marker-pill");
    expect(towerPill.querySelector(".map-context-marker-title")?.textContent).toBe("Mako 945");
    expect(towerPill.querySelectorAll(".map-context-marker-meta")[0]?.textContent).toBe("Tower | QL 88.50 | DMG 1.25");
    expect(towerPill.querySelectorAll(".map-context-marker-meta")[1]?.textContent).toBe("Tower type: Freedom Isles");
    expect(towerPill.querySelector(".map-context-marker-modifier")?.textContent).toBe("Last Modified: Sam");
    expect(screen.queryByText("Creator")).toBeNull();

    fireEvent.mouseLeave(tower);
    await waitFor(() => expect(screen.queryByRole("tooltip", { name: "Map items at 320, 330" })).toBeNull());

    const deed = screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" });
    fireEvent.mouseMove(deed, {
      clientX: 420,
      clientY: 430
    });

    const deedDetails = screen.getByRole("tooltip", { name: "Map items at 420, 430" });
    expect(within(deedDetails).getByText("Map items at 420, 430")).toBeTruthy();
    const deedPill = within(deedDetails).getByTestId("hover-marker-pill");
    expect(deedPill.querySelector(".map-context-marker-title")?.textContent).toBe("Oak Harbour");
    expect(deedPill.querySelector(".map-context-marker-meta")?.textContent).toBe("Deed | Mayor Founder | 11x11");
    expect(deedPill.querySelector(".map-context-marker-modifier")?.textContent).toBe("Last Modified: Kichi");
    expect(screen.queryByText("Name")).toBeNull();
    expect(screen.queryByText("Founding date")).toBeNull();
  });

  it("keeps hover and tap details inside viewport edges", () => {
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

    fireEvent.mouseMove(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 2040,
      clientY: 2040
    });

    const details = screen.getByRole("tooltip", { name: "Map items at 2040, 2040" });
    expect(details.style.left).toBe("1756px");
    expect(details.style.top).toBe("1816px");
  });

  it("shows stacked hover pills for markers underneath an overlay", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          east: 5,
          foundingDate: null,
          founder: "Founder",
          id: "deed-1",
          lastModifiedBy: "Sam",
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
          damage: "0.25",
          id: "tower-1",
          lastModifiedBy: "Alyeska",
          makerName: "Mako",
          makerNumber: "945",
          ql: "89.50",
          towerType: "Mol-Rehan",
          type: "tower",
          x: 500,
          y: 600
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.mouseMove(screen.getByTestId("deed-overlay-deed-1"), {
      clientX: 500,
      clientY: 600
    });

    const details = screen.getByRole("tooltip", { name: "Map items at 500, 600" });
    expect(details.className).toContain("map-hover-details");
    expect(within(details).queryByText("Deed: Oak Harbour")).toBeNull();

    const pills = within(details).getAllByTestId("hover-marker-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0]?.className).toContain("map-context-marker-row");
    expect(pills[0]?.querySelector(".map-context-marker-title")?.textContent).toBe("Oak Harbour");
    expect(pills[0]?.querySelector(".map-context-marker-meta")?.textContent).toBe("Deed | Mayor Founder | 11x11");
    expect(pills[0]?.querySelector(".map-context-marker-modifier")?.textContent).toBe("Last Modified: Sam");
    expect(pills[1]?.className).toContain("map-context-marker-row");
    expect(pills[1]?.querySelector(".map-context-marker-title")?.textContent).toBe("Mako 945");
    expect(pills[1]?.querySelectorAll(".map-context-marker-meta")[0]?.textContent).toBe("Tower | QL 89.50 | DMG 0.25");
    expect(pills[1]?.querySelectorAll(".map-context-marker-meta")[1]?.textContent).toBe("Tower type: Mol-Rehan");
    expect(pills[1]?.querySelector(".map-context-marker-modifier")?.textContent).toBe("Last Modified: Alyeska");
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

    expect(screen.getByRole("tooltip", { name: "Map items at 320, 330" })).toBeTruthy();

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
          planned: false,
          ql: "88.50",
          towerType: "Freedom Isles"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
  });

  it("relocates an edited marker by dragging its center pip before saving", async () => {
    const savedTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      ql: "88.50",
      type: "tower",
      x: 280,
      y: 335
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: savedTower }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          ...savedTower,
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const editedTower = screen.getByTestId("tower-center-tower-1");
    const startLeft = Number.parseFloat(editedTower.style.left);
    const startTop = Number.parseFloat(editedTower.style.top);
    fireEvent.pointerDown(editedTower, {
      button: 0,
      clientX: startLeft + 1,
      clientY: startTop + 1,
      pointerId: 51
    });
    fireEvent.pointerMove(window, {
      clientX: startLeft + 31,
      clientY: startTop + 36,
      pointerId: 51
    });
    fireEvent.pointerUp(window, { pointerId: 51 });

    await waitFor(() => expect(screen.getByLabelText("X")).toHaveProperty("value", "280"));
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "335");
    expect(Number.parseFloat(screen.getByTestId("tower-center-tower-1").style.left)).toBe(startLeft + 30);
    expect(Number.parseFloat(screen.getByTestId("tower-center-tower-1").style.top)).toBe(startTop + 35);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/tower/tower-1",
      {
        body: JSON.stringify({
          type: "tower",
          x: 280,
          y: 335,
          damage: "1.25",
          makerName: "Mako",
          makerNumber: "945",
          planned: false,
          ql: "88.50",
          towerType: "Freedom Isles"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
  });

  it("resizes an edited deed by shift-dragging its overlay before saving", async () => {
    const savedDeed = {
      east: 5,
      foundingDate: null,
      founder: "Founder",
      id: "deed-1",
      name: "Oak Harbour",
      north: 10,
      perimeter: 5,
      south: 5,
      type: "deed",
      west: 10,
      x: 500,
      y: 600
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: savedDeed }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          ...savedDeed,
          north: 5,
          west: 5
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByTestId("deed-overlay-deed-1"), {
      clientX: 500,
      clientY: 600
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Deed Oak Harbour" }));

    const editedOverlay = screen.getByTestId("deed-overlay-deed-1");
    const startLeft = Number.parseFloat(editedOverlay.style.left);
    const startTop = Number.parseFloat(editedOverlay.style.top);
    fireEvent.pointerDown(editedOverlay, {
      button: 0,
      clientX: startLeft,
      clientY: startTop,
      pointerId: 61,
      shiftKey: true
    });
    fireEvent.pointerMove(window, {
      clientX: startLeft - 5,
      clientY: startTop - 5,
      pointerId: 61,
      shiftKey: true
    });
    fireEvent.pointerUp(window, { pointerId: 61 });

    await waitFor(() => expect(screen.getByLabelText("North")).toHaveProperty("value", "10"));
    expect(screen.getByLabelText("West")).toHaveProperty("value", "10");
    expect(screen.getByLabelText("East")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("South")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("X")).toHaveProperty("value", "500");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "600");
    expect(screen.getByTestId("deed-overlay-deed-1").style.left).toBe(`${startLeft - 5}px`);
    expect(screen.getByTestId("deed-overlay-deed-1").style.top).toBe(`${startTop - 5}px`);
    expect(screen.getByTestId("deed-overlay-deed-1").style.width).toBe("16px");
    expect(screen.getByTestId("deed-overlay-deed-1").style.height).toBe("16px");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/deed/deed-1",
      {
        body: JSON.stringify({
          type: "deed",
          x: 500,
          y: 600,
          east: 5,
          foundingDate: "",
          founder: "Founder",
          name: "Oak Harbour",
          north: 10,
          perimeter: 5,
          south: 5,
          west: 10
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
  });

  it("updates the edited deed overlay while directional dimension fields change", () => {
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

    fireEvent.contextMenu(screen.getByTestId("deed-overlay-deed-1"), {
      clientX: 500,
      clientY: 600
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Deed Oak Harbour" }));

    const initialOverlay = screen.getByTestId("deed-overlay-deed-1");
    const initialLeft = Number.parseFloat(initialOverlay.style.left);
    const initialTop = Number.parseFloat(initialOverlay.style.top);

    fireEvent.change(screen.getByLabelText("North"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("West"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("East"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("South"), { target: { value: "6" } });

    const overlay = screen.getByTestId("deed-overlay-deed-1");
    expect(overlay.style.left).toBe(`${initialLeft - 2}px`);
    expect(overlay.style.top).toBe(`${initialTop - 3}px`);
    expect(overlay.style.width).toBe("17px");
    expect(overlay.style.height).toBe("15px");
  });

  it("preserves single digit tower creator numbers from the combined creator field", async () => {
    const savedTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Kichi",
      makerNumber: "1",
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

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Kichi 1 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Kichi 1" }));

    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Kichi 1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/tower/tower-1",
      {
        body: JSON.stringify({
          type: "tower",
          x: 250,
          y: 300,
          damage: "1.25",
          makerName: "Kichi",
          makerNumber: "1",
          planned: false,
          ql: "88.50",
          towerType: "Freedom Isles"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));
  });

  it("saves the planned tower flag from the edit dialog", async () => {
    const savedTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      planned: true,
      ql: "88.50",
      towerType: "Mol-Rehan",
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
      initialMarkers: [
        {
          ...savedTower,
          planned: false
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const plannedCheckbox = screen.getByRole("checkbox", { name: "Planned" });
    expect(screen.queryByLabelText("Quick Input")).toBeNull();
    expect(plannedCheckbox).toHaveProperty("checked", false);
    expect(screen.getByLabelText("Tower type")).toHaveProperty("value", "Mol-Rehan");
    fireEvent.click(plannedCheckbox);
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
          makerNumber: "945",
          planned: true,
          ql: "88.50",
          towerType: "Mol-Rehan"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      }
    ));

    await waitFor(() => expect(screen.getByTestId("tower-protection-border-top-tower-1").className).toContain("is-planned"));
  });

  it("keeps the original edited tower as the autoplanner source after creating a planned tower", async () => {
    const sourceTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      planned: true,
      ql: "88.50",
      type: "tower",
      x: 250,
      y: 300
    } as const;
    let plannedTowerCount = 1;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      plannedTowerCount += 1;
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return {
        json: async () => ({
          marker: {
            ...payload,
            id: `tower-${plannedTowerCount}`
          }
        }),
        ok: true
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [sourceTower],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const stage = screen.getByTestId("map-stage");
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 71
    });
    fireEvent.pointerUp(window, {
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 71
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calls = fetchMock.mock.calls as unknown as Array<[string | URL | Request, RequestInit?]>;
    expect(calls[0]?.[0]).toBe("/api/maps/map-1/markers");
    expect(calls[0]?.[1]).toMatchObject({
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      damage: "",
      makerName: "",
      makerNumber: "",
      planned: true,
      ql: "",
      towerType: "Freedom Isles",
      type: "tower",
      x: 350,
      y: 300
    });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Edit Tower" })).toBeTruthy());
    expect(screen.getByLabelText("X")).toHaveProperty("value", "250");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "300");
    expect(screen.getByLabelText("QL")).toHaveProperty("value", "88.50");
    expect(screen.getByLabelText("Damage")).toHaveProperty("value", "1.25");
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Mako 945");
    expect(screen.getByTestId("tower-center-tower-2")).toBeTruthy();

    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 1029,
      clientY: 844,
      ctrlKey: true,
      pointerId: 72
    });
    fireEvent.pointerUp(window, {
      clientX: 1029,
      clientY: 844,
      ctrlKey: true,
      pointerId: 72
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({
      planned: true,
      type: "tower",
      x: 250,
      y: 200
    });
    expect(screen.getByLabelText("X")).toHaveProperty("value", "250");
    expect(screen.getByLabelText("Y")).toHaveProperty("value", "300");
  });

  it("autoplans a new planned tower 100 tiles vertically from an edited planned tower", async () => {
    const sourceTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      planned: true,
      ql: "88.50",
      type: "tower",
      x: 250,
      y: 300
    } as const;
    const plannedTower = {
      damage: "",
      id: "tower-2",
      makerName: "",
      makerNumber: "",
      planned: true,
      ql: "",
      type: "tower",
      x: 250,
      y: 200
    } as const;
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ marker: plannedTower }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [sourceTower],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const stage = screen.getByTestId("map-stage");
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 1029,
      clientY: 844,
      ctrlKey: true,
      pointerId: 72
    });
    fireEvent.pointerUp(window, {
      clientX: 1029,
      clientY: 844,
      ctrlKey: true,
      pointerId: 72
    });

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as Array<[string | URL | Request, RequestInit?]>;
      expect(JSON.parse(String(calls[0]?.[1]?.body))).toMatchObject({
        planned: true,
        type: "tower",
        x: 250,
        y: 200
      });
    });
  });

  it("does not autoplan directly on top of another tower", async () => {
    const sourceTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      planned: true,
      ql: "88.50",
      type: "tower",
      x: 250,
      y: 300
    } as const;
    const existingTower = {
      damage: "0.00",
      id: "tower-2",
      makerName: "Existing",
      makerNumber: "",
      planned: false,
      ql: "50.00",
      type: "tower",
      x: 350,
      y: 300
    } as const;
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [sourceTower, existingTower],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const stage = screen.getByTestId("map-stage");
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 74
    });
    fireEvent.pointerUp(window, {
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 74
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("A tower already exists at 350, 300")).toBeTruthy();
  });

  it("does not autoplan from an edited tower that is not planned", () => {
    const sourceTower = {
      damage: "1.25",
      id: "tower-1",
      makerName: "Mako",
      makerNumber: "945",
      planned: false,
      ql: "88.50",
      type: "tower",
      x: 250,
      y: 300
    } as const;
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [sourceTower],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    const stage = screen.getByTestId("map-stage");
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 73
    });
    fireEvent.pointerUp(window, {
      clientX: 1274,
      clientY: 1034,
      ctrlKey: true,
      pointerId: 73
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows note hover details with the grouped marker interface", () => {
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

    const details = screen.getByRole("tooltip", { name: "Map items at 720, 730" });
    const pill = within(details).getByTestId("hover-marker-pill");
    expect(pill.querySelector(".map-context-marker-title")?.textContent).toBe("Mine entrance");
    expect(pill.querySelector(".map-context-marker-meta")?.textContent).toBe("Note | Landmarks");
    expect(pill.querySelector(".map-context-marker-modifier")?.textContent).toBe("Last Modified: Unknown");
    expect(screen.queryByText("Scout here")).toBeNull();
  });

  it("renders note pips with category-specific color, size, and shape", () => {
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
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        noteCategoryColors: {
          "category-landmarks": "#00ffaa"
        },
        noteCategoryMarkerShapes: {
          "category-landmarks": "square"
        },
        noteCategoryPipSizes: {
          "category-landmarks": 8
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    const note = screen.getByTestId("note-center-note-1");

    expect(note.className).toContain("map-marker--note-shape-square");
    expect(note.style.getPropertyValue("--map-note-category-color")).toBe("#00ffaa");
    expect(note.style.width).toBe("8px");
    expect(note.style.height).toBe("8px");
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
        },
        {
          casterFacing: "north",
          direction: "aheadLeft",
          distanceBand: "50-199",
          id: "locate-soul-1",
          notes: "Corpse result",
          targetName: "Funkiey",
          type: "locateSoul",
          x: 930,
          y: 1030
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.mouseMove(screen.getByRole("button", { name: "Rift at 900, 1000" }), {
      clientX: 900,
      clientY: 1000
    });
    const riftDetails = screen.getByRole("tooltip", { name: "Map items at 900, 1000" });
    const riftPill = within(riftDetails).getByTestId("hover-marker-pill");
    expect(riftPill.querySelector(".map-context-marker-title")?.textContent).toBe("Rift");
    expect(riftPill.querySelector(".map-context-marker-meta")?.textContent).toBe("Rift | 2026-05-10T18:30");
    expect(within(riftDetails).queryByText("Bring cotton")).toBeNull();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Camp Goblin at 910, 1010" }), {
      clientX: 910,
      clientY: 1010
    });
    const campDetails = screen.getByRole("tooltip", { name: "Map items at 910, 1010" });
    expect(within(campDetails).getByText("Goblin camp")).toBeTruthy();
    expect(within(campDetails).getByText("Camp | Goblin")).toBeTruthy();
    expect(within(campDetails).getByText("Rift")).toBeTruthy();
    expect(within(campDetails).getByText("Rift | 2026-05-10T18:30")).toBeTruthy();
    expect(within(campDetails).queryByText("Needs scouts")).toBeNull();
    expect(within(campDetails).getAllByTestId("hover-marker-pill")[0]?.className).toContain("map-context-marker-row");

    fireEvent.mouseMove(screen.getByRole("button", { name: "Minedoor at 920, 1020" }), {
      clientX: 920,
      clientY: 1020
    });
    const minedoorDetails = screen.getByRole("tooltip", { name: "Map items at 920, 1020" });
    expect(within(minedoorDetails).getByText("Minedoor")).toBeTruthy();
    expect(within(minedoorDetails).getByText("Minedoor | Strength 73ql")).toBeTruthy();
    expect(within(minedoorDetails).queryByText("Hidden entrance")).toBeNull();
    expect(within(minedoorDetails).getAllByTestId("hover-marker-pill")[0]?.className).toContain("map-context-marker-row");

    fireEvent.mouseMove(screen.getByRole("button", { name: "Locate Soul Funkiey at 930, 1030" }), {
      clientX: 930,
      clientY: 1030
    });
    const locateSoulDetails = screen.getByRole("tooltip", { name: "Map items at 930, 1030" });
    const locateSoulPill = within(locateSoulDetails).getByTestId("hover-marker-pill");
    expect(locateSoulPill.querySelector(".map-context-marker-title")?.textContent).toBe("Locate Soul Funkiey");
    expect(locateSoulPill.querySelector(".map-context-marker-meta")?.textContent).toBe("Locate Soul | Ahead left | 50-199 tiles");
    expect(within(locateSoulDetails).queryByText("Corpse result")).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Account settings" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("dialog", { name: "Account settings" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Account settings" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Tower Names" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Deed Names" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Mission Grid" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Map visibility" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Map colors" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Map layers" })).toBeNull();
    const layerGroup = screen.getByRole("group", { name: "Map Layers" });
    let layerControls = within(layerGroup);
    ["Markers", "Roadways", "Misc"].forEach((categoryName) => {
      const category = layerControls.getByRole("button", { name: categoryName });

      expect(category).toHaveProperty("type", "button");
      expect(category.getAttribute("aria-expanded")).toBe("false");
    });
    expect(layerControls.queryByRole("button", { name: "Map" })).toBeNull();
    expect(layerControls.queryByRole("checkbox", { name: "Towers" })).toBeNull();
    layerControls = expandAllLayerCategories();
    ["Markers", "Roadways", "Misc"].forEach((categoryName) => {
      expect(layerControls.getByRole("button", { name: categoryName }).getAttribute("aria-expanded")).toBe("true");
    });
    const orderedLayerItems = Array.from(layerGroup.querySelectorAll("[data-layer-category], [data-layer-row]"))
      .map((element) => element.getAttribute("data-layer-category") ?? element.getAttribute("data-layer-row"));
    expect(orderedLayerItems).toEqual([
      "Overlays",
      "Unique Spawn Area",
      "Tower Names",
      "Deed Names",
      "Sector Grid",
      "Mission Grid",
      "Search Lines",
      "Markers",
      "Annotations",
      "Towers",
      "Planned Towers",
      "Deeds",
      "Deed Perimeters",
      "Notes",
      "Roadways",
      "Bridges",
      "Canals",
      "Highways",
      "Tunnels",
      "Misc",
      "Rifts",
      "Camps",
      "Minedoors",
      "Locate Souls"
    ]);
    expect(layerControls.getByRole("checkbox", { name: "Overlays" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Annotations" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Towers" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Planned Towers" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Tower Names" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deeds" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deed Perimeters" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Deed Names" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Notes" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Camps" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Minedoors" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Locate Souls" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Canals" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Highways" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Rifts" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Sector Grid" })).toBeTruthy();
    expect(layerControls.getByRole("checkbox", { name: "Mission Grid" })).toBeTruthy();
    expect(layerControls.getByLabelText("Towers color")).toBeTruthy();
    expect(layerControls.getByLabelText("Annotations color")).toHaveProperty("value", "#38bdf8");
    expect(layerControls.getByLabelText("Deeds color")).toBeTruthy();
    expect(layerControls.getByLabelText("Notes color")).toBeTruthy();
    expect(layerControls.getByLabelText("Camps color")).toHaveProperty("value", "#facc15");
    expect(layerControls.getByLabelText("Minedoors color")).toHaveProperty("value", "#22d3ee");
    expect(layerControls.getByLabelText("Locate Souls color")).toHaveProperty("value", "#f97316");
    expect(layerControls.getByLabelText("Rifts color")).toHaveProperty("value", "#ef4444");
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", "#cc00cc");
    expect(layerControls.getByLabelText("Canals color")).toHaveProperty("value", "#0055cc");
    expect(layerControls.getByLabelText("Highways color")).toHaveProperty("value", "#cccc00");
    expect(layerControls.getByLabelText("Sector Grid color")).toBeTruthy();
    expect(layerControls.getByLabelText("Mission Grid color")).toBeTruthy();
    expect(layerControls.queryByLabelText("Tile highlight color")).toBeNull();
    const tileHighlightControls = within(screen.getByRole("group", { name: "Tile Highlighting" }));
    expect(tileHighlightControls.getByLabelText("Tile highlight color")).toHaveProperty("value", "#c000ff");
    const bridgeRow = layerControls.getByRole("checkbox", { name: "Bridges" }).closest(".map-layer-row");
    expect(bridgeRow).not.toBeNull();
    expect(Array.from(bridgeRow?.children ?? [])).toEqual([
      layerControls.getByRole("checkbox", { name: "Bridges" }),
      layerControls.getByLabelText("Bridges color"),
      expect.objectContaining({ textContent: "Bridges" }),
      layerControls.getByRole("slider", { name: "Bridges opacity" })
    ]);
    expect(layerControls.getByRole("slider", { name: "Towers opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Annotations opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Deeds opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Notes opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Locate Souls opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Rifts opacity" })).toHaveProperty("value", "100");
    expect(layerControls.getByRole("slider", { name: "Sector Grid opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Mission Grid opacity" })).toHaveProperty("value", "50");
    expect(layerControls.queryByRole("slider", { name: "Tile highlight opacity" })).toBeNull();
    expect(tileHighlightControls.getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "50");
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
    expect(screen.getByTestId("tower-center-tower-1").style.opacity).toBe("1");
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }).style.backgroundColor).toBe("rgb(255, 0, 255)");
    expect(screen.getByRole("button", { name: "Note General - Scout note at 700, 800" }).style.opacity).toBe("1");
  });

  it("can hide planned towers without hiding built towers", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "",
          id: "tower-built",
          makerName: "Kichi",
          makerNumber: "1",
          planned: false,
          ql: "",
          type: "tower",
          x: 250,
          y: 300
        },
        {
          damage: "",
          id: "tower-planned",
          makerName: "",
          makerNumber: "",
          planned: true,
          ql: "",
          type: "tower",
          x: 350,
          y: 400
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.getByTestId("tower-center-tower-built")).toBeTruthy();
    expect(screen.getByTestId("tower-center-tower-planned")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const layerControls = expandLayerCategory("Markers");
    const plannedTowersToggle = layerControls.getByRole("checkbox", { name: "Planned Towers" });

    expect(plannedTowersToggle).toHaveProperty("checked", true);
    fireEvent.click(plannedTowersToggle);

    expect(screen.getByTestId("tower-center-tower-built")).toBeTruthy();
    expect(screen.queryByTestId("tower-center-tower-planned")).toBeNull();
  });

  it("lets writers add and update note category presentation from settings", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url === "/api/maps/map-1/settings" && init?.method === "PATCH") {
        return {
          json: async () => ({}),
          ok: true
        };
      }

      if (url === "/api/maps/map-1/note-categories" && init?.method === "POST") {
        return {
          json: async () => ({
            category: { color: null, id: "category-mines", markerShape: "circle", name: "Mines", pipSize: 3 }
          }),
          ok: true
        };
      }

      return {
        json: async () => ({
          category: { color: null, id: "category-landmarks", markerShape: "square", name: "Mines", pipSize: 8 }
        }),
        ok: true
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        noteCategoryColors: {
          "category-landmarks": "#00ffaa"
        },
        noteCategoryMarkerShapes: {
          "category-landmarks": "triangle"
        },
        noteCategoryPipSizes: {
          "category-landmarks": 6
        }
      },
      map: activeMap,
      viewer: writerViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const categoryControls = expandNoteCategories();

    expect(categoryControls.getByRole("button", { name: "Add note category" })).toBeTruthy();
    expect(categoryControls.queryByRole("button", { name: "Delete Landmarks category" })).toBeNull();
    expect(categoryControls.getByLabelText("Landmarks color")).toHaveProperty("value", "#00ffaa");
    expect(categoryControls.getByRole("spinbutton", { name: "Landmarks pip size" })).toHaveProperty("value", "6");
    expect(categoryControls.getByRole("combobox", { name: "Landmarks marker shape" })).toHaveProperty("value", "triangle");

    fireEvent.change(categoryControls.getByLabelText("Landmarks name"), {
      target: { value: "Mines" }
    });
    fireEvent.change(categoryControls.getByLabelText("Landmarks color"), {
      target: { value: "#ff00ff" }
    });
    fireEvent.change(categoryControls.getByRole("spinbutton", { name: "Landmarks pip size" }), {
      target: { value: "8" }
    });
    fireEvent.change(categoryControls.getByRole("combobox", { name: "Landmarks marker shape" }), {
      target: { value: "square" }
    });
    const saveButton = categoryControls.getByRole("button", { name: "Save Landmarks category" });

    expect(saveButton.textContent).toBe("✓");
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/note-categories/category-landmarks",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Mines"
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));
    expect(screen.getByRole("button", { name: "Note Mines - Mine entrance at 700, 800" })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));
    const settingsCall = fetchMock.mock.calls.find((call) => call[0] === "/api/maps/map-1/settings");
    const settingsBody = JSON.parse(String((settingsCall?.[1] as RequestInit | undefined)?.body));
    expect(settingsBody.noteCategoryColors).toEqual({
      "category-landmarks": "#ff00ff"
    });
    expect(settingsBody.noteCategoryMarkerShapes).toEqual({
      "category-landmarks": "square"
    });
    expect(settingsBody.noteCategoryPipSizes).toEqual({
      "category-landmarks": 8
    });

    fireEvent.click(categoryControls.getByRole("button", { name: "Add note category" }));
    fireEvent.change(categoryControls.getByLabelText("New note category name"), {
      target: { value: "Mines" }
    });
    fireEvent.click(categoryControls.getByRole("button", { name: "Create note category" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/note-categories",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Mines"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    ));
  });

  it("lets admins delete note categories and reassign visible notes to General", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        category: { id: "category-landmarks", reassignedTo: "General" }
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const categoryControls = expandNoteCategories();
    const deleteButton = categoryControls.getByRole("button", { name: "Delete Landmarks category" });

    expect(deleteButton.textContent).toBe("×");
    fireEvent.click(deleteButton);

    expect(confirmMock).toHaveBeenCalledWith("Delete the Landmarks note category? Notes in this category will move to General.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/maps/map-1/note-categories/category-landmarks",
      { method: "DELETE" }
    ));
    expect(screen.getByRole("button", { name: "Note General - Mine entrance at 700, 800" })).toBeTruthy();
  });

  it("keeps note categories collapsed by default and cancels category deletion when not confirmed", () => {
    const fetchMock = vi.fn();
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    vi.stubGlobal("confirm", confirmMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const categoryControls = within(screen.getByRole("group", { name: "Note Categories" }));
    const toggle = categoryControls.getByRole("button", { name: "Note Categories" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(categoryControls.queryByLabelText("Landmarks name")).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(categoryControls.getByRole("button", { name: "Delete Landmarks category" }));

    expect(confirmMock).toHaveBeenCalledWith("Delete the Landmarks note category? Notes in this category will move to General.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents read-only users from changing note categories in settings", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: readOnlyViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const categoryControls = expandNoteCategories();

    expect(categoryControls.queryByRole("button", { name: "Add note category" })).toBeNull();
    expect(categoryControls.queryByRole("button", { name: "Save Landmarks category" })).toBeNull();
    expect(categoryControls.getByLabelText("Landmarks name")).toHaveProperty("disabled", true);
    expect(categoryControls.getByLabelText("Landmarks color")).toHaveProperty("disabled", true);
  });

  it("toggles the WurmMaps sector grid separately from the mission grid", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByTestId("sector-grid-overlay")).toBeNull();
    expect(screen.queryByTestId("mission-grid-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sector Grid" }));

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

    const layerControls = expandAllLayerCategories();
    fireEvent.change(layerControls.getByLabelText("Sector Grid color"), {
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

  it("moves tile highlighting controls to the bottom of settings", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("group", { name: "Tile Highlighting" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const settings = screen.getByRole("dialog", { name: "Settings" });
    const layerControls = expandAllLayerCategories();
    const tileHighlightPanel = within(settings).getByRole("group", { name: "Tile Highlighting" });
    expect(tileHighlightPanel.className).toContain("map-layer-controls");
    expect(tileHighlightPanel.className).toContain("map-settings-tool-group");
    const tileHighlighting = within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" });

    expect(tileHighlighting).toHaveProperty("value", "");
    expect(layerControls.queryByLabelText("Tile highlight color")).toBeNull();
    expect(layerControls.queryByRole("slider", { name: "Tile highlight opacity" })).toBeNull();
    expect(within(tileHighlightPanel).getByLabelText("Tile highlight color")).toHaveProperty("value", "#c000ff");
    expect(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "50");
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
    fireEvent.change(within(tileHighlightPanel).getByLabelText("Tile highlight color"), {
      target: { value: "#00ff00" }
    });
    fireEvent.change(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" }), {
      target: { value: "55" }
    });

    expect(tileHighlighting).toHaveProperty("value", "Clay");
    expect(within(tileHighlightPanel).getByLabelText("Tile highlight color")).toHaveProperty("value", "#00ff00");
    expect(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "55");
  });

  it("keeps tile highlighting and roadway edit controls off the map surface", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(document.querySelector(".map-right-side-controls")).toBeNull();
    expect(screen.queryByRole("group", { name: "Tile Highlighting" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Roadway Edit Mode" })).toBeNull();
    expect(screen.queryByTestId("tile-highlight-drag-handle")).toBeNull();
    expect(screen.queryByTestId("roadway-edit-drag-handle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(within(settings).getByRole("group", { name: "Tile Highlighting" }).className).toContain("map-settings-tool-group");
    const roadwayPanel = within(settings).getByRole("group", { name: "Roadway Edit Mode" });
    expect(roadwayPanel.className).toContain("map-settings-tool-group");
    expect(within(roadwayPanel).queryByText("Enabled")).toBeNull();
    expect(within(roadwayPanel).queryByText("Disabled")).toBeNull();
    expect(screen.queryByTestId("tile-highlight-drag-handle")).toBeNull();
    expect(screen.queryByTestId("roadway-edit-drag-handle")).toBeNull();
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
          locateSouls: "#f97316",
          minedoors: "#06b6d4",
          rifts: "#dc2626",
          sectorGrid: "#ff8800"
        },
        markerOpacities: {
          ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
          bridges: 58,
          canals: 67,
          highways: 76,
          locateSouls: 64,
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
          locateSouls: false,
          minedoors: false,
          riftOverlays: false,
          sectorGrid: true
        },
        tileHighlight: {
          color: "#00ffaa",
          opacity: 55,
          selection: "Clay"
        },
        roadwayEditPanelPosition: {
          left: 320,
          top: 500
        },
        tileHighlightPanelPosition: {
          left: 72,
          top: 44
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("group", { name: "Tile Highlighting" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Roadway Edit Mode" })).toBeNull();

    const sectorGrid = screen.getByTestId("sector-grid-overlay");
    expect(sectorGrid.style.color).toBe("rgb(255, 136, 0)");
    expect(sectorGrid.style.opacity).toBe("0.45");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    const layerControls = expandAllLayerCategories();
    const tileHighlightPanel = within(settings).getByRole("group", { name: "Tile Highlighting" });
    const roadwayPanel = within(settings).getByRole("group", { name: "Roadway Edit Mode" });
    expect(tileHighlightPanel.className).not.toContain("is-positioned");
    expect(roadwayPanel.className).not.toContain("is-positioned");
    expect(within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" })).toHaveProperty("value", "Clay");
    expect(within(roadwayPanel).getByRole("checkbox", { name: "Roadway Edit Mode" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Camps" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Deed Perimeters" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Minedoors" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Canals" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Highways" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Locate Souls" })).toHaveProperty("checked", false);
    expect(layerControls.getByLabelText("Camps color")).toHaveProperty("value", "#f59e0b");
    expect(layerControls.getByLabelText("Locate Souls color")).toHaveProperty("value", "#f97316");
    expect(layerControls.getByLabelText("Minedoors color")).toHaveProperty("value", "#06b6d4");
    expect(layerControls.getByLabelText("Rifts color")).toHaveProperty("value", "#dc2626");
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", "#d946ef");
    expect(layerControls.getByLabelText("Canals color")).toHaveProperty("value", "#2563eb");
    expect(layerControls.getByLabelText("Highways color")).toHaveProperty("value", "#fde047");
    expect(layerControls.getByRole("slider", { name: "Bridges opacity" })).toHaveProperty("value", "58");
    expect(layerControls.getByRole("slider", { name: "Canals opacity" })).toHaveProperty("value", "67");
    expect(layerControls.getByRole("slider", { name: "Highways opacity" })).toHaveProperty("value", "76");
    expect(layerControls.getByRole("slider", { name: "Locate Souls opacity" })).toHaveProperty("value", "64");
    expect(within(tileHighlightPanel).getByLabelText("Tile highlight color")).toHaveProperty("value", "#00ffaa");
    expect(layerControls.queryByRole("checkbox", { name: "Highway Details" })).toBeNull();
    expect(layerControls.getByRole("checkbox", { name: "Rifts" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("slider", { name: "Rifts opacity" })).toHaveProperty("value", "62");
    expect(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "55");
  });

  it("resets user map settings to defaults from the settings menu", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        markerColors: {
          ...DEFAULT_USER_MAP_SETTINGS.markerColors,
          bridges: "#d946ef",
          camps: "#f59e0b",
          locateSouls: "#f97316",
          rifts: "#dc2626",
          sectorGrid: "#ff8800"
        },
        markerOpacities: {
          ...DEFAULT_USER_MAP_SETTINGS.markerOpacities,
          bridges: 91,
          locateSouls: 61,
          riftOverlays: 12,
          sectorGrid: 25
        },
        markerVisibility: {
          ...DEFAULT_USER_MAP_SETTINGS.markerVisibility,
          bridges: false,
          camps: false,
          locateSouls: false,
          riftOverlays: false,
          sectorGrid: true
        },
        roadwayEditPanelPosition: {
          left: 320,
          top: 500
        },
        tileHighlight: {
          color: "#00ffaa",
          opacity: 87,
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

    expect(screen.queryByRole("group", { name: "Tile Highlighting" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Roadway Edit Mode" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    const layerControls = expandAllLayerCategories();
    const tileHighlightPanel = within(settings).getByRole("group", { name: "Tile Highlighting" });
    const roadwayPanel = within(settings).getByRole("group", { name: "Roadway Edit Mode" });
    expect(within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" })).toHaveProperty("value", "Clay");
    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toHaveProperty("checked", false);
    expect(layerControls.getByRole("checkbox", { name: "Locate Souls" })).toHaveProperty("checked", false);
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", "#d946ef");
    expect(layerControls.getByLabelText("Locate Souls color")).toHaveProperty("value", "#f97316");
    expect(layerControls.getByLabelText("Rifts color")).toHaveProperty("value", "#dc2626");
    expect(layerControls.getByRole("slider", { name: "Bridges opacity" })).toHaveProperty("value", "91");
    expect(layerControls.getByRole("slider", { name: "Locate Souls opacity" })).toHaveProperty("value", "61");
    expect(layerControls.getByRole("slider", { name: "Rifts opacity" })).toHaveProperty("value", "12");
    expect(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "87");

    fireEvent.click(within(settings).getByRole("button", { name: "Default" }));

    expect(layerControls.getByRole("checkbox", { name: "Bridges" })).toHaveProperty("checked", true);
    expect(layerControls.getByRole("checkbox", { name: "Camps" })).toHaveProperty("checked", true);
    expect(layerControls.getByRole("checkbox", { name: "Locate Souls" })).toHaveProperty("checked", true);
    expect(layerControls.getByRole("checkbox", { name: "Rifts" })).toHaveProperty("checked", true);
    expect(layerControls.getByRole("checkbox", { name: "Sector Grid" })).toHaveProperty("checked", false);
    expect(layerControls.getByLabelText("Bridges color")).toHaveProperty("value", DEFAULT_USER_MAP_SETTINGS.markerColors.bridges);
    expect(layerControls.getByLabelText("Camps color")).toHaveProperty("value", DEFAULT_USER_MAP_SETTINGS.markerColors.camps);
    expect(layerControls.getByLabelText("Locate Souls color")).toHaveProperty("value", DEFAULT_USER_MAP_SETTINGS.markerColors.locateSouls);
    expect(layerControls.getByLabelText("Rifts color")).toHaveProperty("value", DEFAULT_USER_MAP_SETTINGS.markerColors.rifts);
    expect(layerControls.getByLabelText("Sector Grid color")).toHaveProperty("value", DEFAULT_USER_MAP_SETTINGS.markerColors.sectorGrid);
    expect(layerControls.getByRole("slider", { name: "Bridges opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Locate Souls opacity" })).toHaveProperty("value", "50");
    expect(layerControls.getByRole("slider", { name: "Rifts opacity" })).toHaveProperty("value", "100");
    expect(within(tileHighlightPanel).getByRole("slider", { name: "Tile highlight opacity" })).toHaveProperty("value", "50");
    expect(within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" })).toHaveProperty("value", "");
    expect(tileHighlightPanel.className).not.toContain("is-positioned");
    expect(roadwayPanel.className).not.toContain("is-positioned");
  });

  it("saves user map settings when settings-only map controls change", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    expandAllLayerCategories();
    const tileHighlightPanel = within(settings).getByRole("group", { name: "Tile Highlighting" });
    fireEvent.change(within(tileHighlightPanel).getByLabelText("Tile highlight color"), {
      target: { value: "#00ff00" }
    });
    fireEvent.change(within(tileHighlightPanel).getByRole("combobox", { name: "Tile Highlighting" }), {
      target: { value: "Clay" }
    });

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
        color: "#00ff00",
        selection: "Clay"
      }
    });
  });

  it("applies opacity sliders to overlays and keeps center pips opaque", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sector Grid" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mission Grid" }));

    const layerControls = expandAllLayerCategories();
    fireEvent.change(layerControls.getByRole("slider", { name: "Towers opacity" }), {
      target: { value: "0" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Deeds opacity" }), {
      target: { value: "100" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Notes opacity" }), {
      target: { value: "65" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Rifts opacity" }), {
      target: { value: "100" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Sector Grid opacity" }), {
      target: { value: "35" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Mission Grid opacity" }), {
      target: { value: "100" }
    });

    expect(screen.getByTestId("tower-center-tower-1").style.opacity).toBe("1");
    expect(screen.getByTestId("tower-protection-tower-1").style.opacity).toBe("0");
    expect(screen.getByTestId("deed-center-deed-1").style.opacity).toBe("1");
    expect(screen.getByTestId("deed-overlay-deed-1").style.backgroundColor).toBe("");
    expect(screen.getByTestId("deed-overlay-deed-1").style.opacity).toBe("1");
    expect(screen.getByTestId("deed-border-top-deed-1").style.backgroundColor).toBe("rgb(250, 204, 21)");
    expect(screen.getByTestId("deed-border-top-deed-1").style.opacity).toBe("1");
    expect(screen.getByTestId("deed-perimeter-top-deed-1").style.backgroundColor).toBe("rgb(250, 204, 21)");
    expect(screen.getByTestId("deed-perimeter-top-deed-1").style.opacity).toBe("1");
    expect(screen.getByTestId("note-center-note-1").style.opacity).toBe("1");
    expect(screen.getByTestId("rift-overlay-rift-1").style.backgroundColor).toBe("");
    expect(screen.getByTestId("rift-overlay-rift-1").style.opacity).toBe("1");
    expect(screen.getByTestId("rift-overlay-border-top-rift-1").style.backgroundColor).toBe("rgb(239, 68, 68)");
    expect(screen.getByTestId("rift-overlay-border-top-rift-1").style.opacity).toBe("1");
    expect(screen.queryByTestId("rift-overlay-camp-1")).toBeNull();
    expect(screen.getByTestId("sector-grid-overlay").style.opacity).toBe("0.35");
    expect(screen.getByTestId("mission-grid-overlay").style.opacity).toBe("1");
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const layerControls = expandAllLayerCategories();
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

  it("renders a toggleable and recolorable 51x51 outlined overlay for rifts only", () => {
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
    expect(overlay.style.backgroundColor).toBe("");
    expect(overlay.style.opacity).toBe("1");
    const borderTop = screen.getByTestId("rift-overlay-border-top-rift-1");
    expect(borderTop.style.backgroundColor).toBe("rgb(239, 68, 68)");
    expect(screen.getByRole("button", { name: "Rift at 900, 1000" }).style.getPropertyValue("--map-rift-color")).toBe("#ef4444");
    expect(screen.queryByTestId("rift-overlay-camp-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const layerControls = expandAllLayerCategories();
    fireEvent.change(layerControls.getByLabelText("Rifts color"), {
      target: { value: "#dc2626" }
    });

    expect(screen.getByTestId("rift-overlay-rift-1").style.backgroundColor).toBe("");
    expect(screen.getByTestId("rift-overlay-border-top-rift-1").style.backgroundColor).toBe("rgb(220, 38, 38)");
    expect(screen.getByRole("button", { name: "Rift at 900, 1000" }).style.getPropertyValue("--map-rift-color")).toBe("#dc2626");

    fireEvent.click(layerControls.getByRole("checkbox", { name: "Rifts" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const layerControls = expandAllLayerCategories();
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
        },
        {
          id: "path-2",
          name: "North Tunnel",
          notes: "Underground",
          points: [
            { x: 150, y: 160 },
            { x: 155, y: 160 }
          ],
          type: "tunnel",
          width: 1,
          x: 150,
          y: 160
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const bridge = screen.getByTestId("path-marker-path-1");
    expect(bridge.getAttribute("stroke")).toBe("#cc00cc");
    expect(bridge.getAttribute("opacity")).toBe("0.5");
    expect(bridge.getAttribute("stroke-width")).toBe("2");
    expect(bridge.getAttribute("points")).toBe("101,121 141,121");
    expect(bridge.getAttribute("stroke-linecap")).toBe("square");
    expect(bridge.getAttribute("stroke-linejoin")).toBe("miter");
    expect(screen.getByTestId("path-marker-path-2").getAttribute("stroke")).toBe("#6b7280");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const layerControls = expandAllLayerCategories();
    fireEvent.change(layerControls.getByLabelText("Bridges color"), {
      target: { value: "#d946ef" }
    });
    fireEvent.change(layerControls.getByRole("slider", { name: "Bridges opacity" }), {
      target: { value: "42" }
    });

    expect(screen.getByTestId("path-marker-path-1").getAttribute("stroke")).toBe("#d946ef");
    expect(screen.getByTestId("path-marker-path-1").getAttribute("opacity")).toBe("0.42");
    expect(layerControls.getByRole("checkbox", { name: "Tunnels" })).toBeTruthy();
    expect(layerControls.getByLabelText("Tunnels color")).toHaveProperty("value", "#6b7280");
    expect(layerControls.getByRole("slider", { name: "Tunnels opacity" })).toHaveProperty("value", "50");

    fireEvent.click(layerControls.getByRole("checkbox", { name: "Bridges" }));
    fireEvent.click(layerControls.getByRole("checkbox", { name: "Tunnels" }));

    expect(screen.queryByTestId("path-marker-path-1")).toBeNull();
    expect(screen.queryByTestId("path-marker-path-2")).toBeNull();
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Roadways" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bridge" }));

    const drawDialog = screen.getByRole("dialog", { name: "Draw Bridge" });
    expect(within(drawDialog).getByText("1 point")).toBeTruthy();
    expect(document.querySelector(".map-path-draft-line")?.getAttribute("stroke-linecap")).toBe("square");
    expect(document.querySelector(".map-path-draft-line")?.getAttribute("stroke-linejoin")).toBe("miter");

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
    fireEvent.click(screen.getByRole("menuitem", { name: "Roadways" }));
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

  it("starts roadway paths at the clicked coordinate when a deed overlay is under the cursor", () => {
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

    fireEvent.contextMenu(screen.getByTestId("deed-overlay-deed-1"), {
      clientX: 503,
      clientY: 604
    });

    expect(screen.getByText("Add at 503, 604")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Roadways" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bridge" }));

    const drawDialog = screen.getByRole("dialog", { name: "Draw Bridge" });
    expect(within(drawDialog).getByText("1: 503, 604")).toBeTruthy();
    expect(within(drawDialog).queryByText("1: 500, 600")).toBeNull();
  });

  it("opens roadway marker actions from map right-clicks when roadway edit mode is active", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          estimatedRiftTime: null,
          id: "rift-1",
          arrivalDate: null,
          notes: "",
          type: "rift",
          x: 503,
          y: 604
        },
        {
          id: "bridge-1",
          name: "Hidden Bridge",
          notes: "Runs under the rift",
          points: [
            { x: 500, y: 604 },
            { x: 510, y: 604 }
          ],
          type: "bridge",
          width: 2,
          x: 500,
          y: 604
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const roadwayEditPanel = within(screen.getByRole("dialog", { name: "Settings" }))
      .getByRole("group", { name: "Roadway Edit Mode" });
    fireEvent.click(within(roadwayEditPanel).getByRole("checkbox", { name: "Roadway Edit Mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.contextMenu(screen.getByTestId("map-stage"), {
      clientX: 503,
      clientY: 604
    });

    const menu = screen.getByRole("menu", { name: "Marker actions" });
    expect(menu.style.left).toBe("503px");
    expect(menu.style.top).toBe("604px");
    expect(screen.getByText("Hidden Bridge")).toBeTruthy();
    expect(screen.getByText("Bridge | 2 points | Width 2")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Edit Bridge Hidden Bridge" })).toBeTruthy();
  });

  it("drags roadway edit points to new coordinates before saving", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url === "/api/markers/bridge/bridge-1" && init?.method === "PATCH") {
        return new Response(JSON.stringify({
          marker: {
            id: "bridge-1",
            name: "Cedar Bridge",
            notes: "River crossing",
            points: [
              { x: 130, y: 150 },
              { x: 140, y: 120 }
            ],
            type: "bridge",
            width: 2,
            x: 130,
            y: 150
          }
        }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "bridge-1",
          name: "Cedar Bridge",
          notes: "River crossing",
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const roadwayEditPanel = within(screen.getByRole("dialog", { name: "Settings" }))
      .getByRole("group", { name: "Roadway Edit Mode" });
    fireEvent.click(within(roadwayEditPanel).getByRole("checkbox", { name: "Roadway Edit Mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.contextMenu(screen.getByTestId("path-marker-bridge-1"), {
      clientX: 120,
      clientY: 120
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Bridge Cedar Bridge" }));

    const drawDialog = screen.getByRole("dialog", { name: "Draw Bridge" });
    expect(screen.queryByTestId("path-marker-bridge-1")).toBeNull();
    const firstPoint = screen.getByRole("button", { name: "Path point 1" });
    const startLeft = Number.parseFloat(firstPoint.style.left);
    const startTop = Number.parseFloat(firstPoint.style.top);
    fireEvent.pointerDown(firstPoint, {
      button: 0,
      clientX: startLeft,
      clientY: startTop,
      pointerId: 88
    });
    fireEvent.pointerMove(window, {
      clientX: startLeft + 29.5,
      clientY: startTop + 29.5,
      pointerId: 88
    });
    fireEvent.pointerUp(window, {
      clientX: startLeft + 29.5,
      clientY: startTop + 29.5,
      pointerId: 88
    });

    await waitFor(() => expect(within(drawDialog).getByText("1: 130, 150")).toBeTruthy());
    expect(within(drawDialog).queryByText("1: 100, 120")).toBeNull();

    fireEvent.click(within(drawDialog).getByRole("button", { name: "Save path" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/bridge/bridge-1",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
        method: "PATCH"
      })
    ));

    const pathUpdateCall = (fetchMock.mock.calls as Array<[string | URL | Request, RequestInit?]>)
      .find((call) => call[0] === "/api/markers/bridge/bridge-1");
    expect(pathUpdateCall).toBeDefined();

    if (pathUpdateCall === undefined) {
      return;
    }

    expect(JSON.parse(String(pathUpdateCall[1]?.body))).toEqual({
      name: "Cedar Bridge",
      notes: "River crossing",
      points: [
        { x: 130, y: 150 },
        { x: 140, y: 120 }
      ],
      type: "bridge",
      width: 2
    });
  });

  it("hides an edited highway while its draft route is active", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const roadwayEditPanel = within(screen.getByRole("dialog", { name: "Settings" }))
      .getByRole("group", { name: "Roadway Edit Mode" });
    fireEvent.click(within(roadwayEditPanel).getByRole("checkbox", { name: "Roadway Edit Mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.contextMenu(screen.getByTestId("path-marker-highway-1"), {
      clientX: 150,
      clientY: 130
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Highway East Road" }));

    expect(screen.queryByTestId("path-marker-highway-1")).toBeNull();
    expect(document.querySelector(".map-path-draft-line")?.getAttribute("points")).toBe("1024.5,1024.5 1084.5,1024.5");
  });

  it("keeps prior highway draft connections visible while moving later points", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "highway-1",
          name: "East Road",
          notes: "Main route",
          points: [
            { x: 120, y: 130 },
            { x: 150, y: 130 },
            { x: 180, y: 130 },
            { x: 210, y: 130 }
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const roadwayEditPanel = within(screen.getByRole("dialog", { name: "Settings" }))
      .getByRole("group", { name: "Roadway Edit Mode" });
    fireEvent.click(within(roadwayEditPanel).getByRole("checkbox", { name: "Roadway Edit Mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.contextMenu(screen.getByTestId("path-marker-highway-1"), {
      clientX: 150,
      clientY: 130
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Highway East Road" }));

    expect(document.querySelector(".map-path-draft-line")?.getAttribute("points")?.split(" ")).toHaveLength(4);

    const draggedPoint = screen.getByRole("button", { name: "Path point 2" });
    const startLeft = Number.parseFloat(draggedPoint.style.left);
    const startTop = Number.parseFloat(draggedPoint.style.top);
    fireEvent.pointerDown(draggedPoint, {
      button: 0,
      clientX: startLeft,
      clientY: startTop,
      pointerId: 89
    });
    fireEvent.pointerMove(window, {
      clientX: startLeft + 9.5,
      clientY: startTop + 29.5,
      pointerId: 89
    });

    await waitFor(() => expect(document.querySelector(".map-path-draft-line")?.getAttribute("points")?.split(" ")).toHaveLength(4));
    expect(document.querySelector(".map-path-draft-line")?.getAttribute("points")?.startsWith("1024.5,1024.5")).toBe(true);

    fireEvent.pointerUp(window, {
      clientX: startLeft + 9.5,
      clientY: startTop + 29.5,
      pointerId: 89
    });

    await waitFor(() => expect(document.querySelector(".map-path-draft-line")?.getAttribute("points")?.split(" ")).toHaveLength(4));
  });

  it("centers even-width roadway paths across whole tiles", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "bridge-1",
          name: "Two Tile Bridge",
          notes: "",
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

    expect(screen.getByTestId("path-marker-bridge-1").getAttribute("points")).toBe("101,121 141,121");
  });

  it("makes tall marker context menus scroll inside the viewport", () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500
    });

    render(React.createElement(MapWorkspace, {
      initialMarkers: Array.from({ length: 14 }, (_, index) => ({
        category: "General",
        id: `note-${index}`,
        text: "",
        title: `Stacked note ${index}`,
        type: "note" as const,
        x: 250,
        y: 300
      })),
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Note General - Stacked note 0 at 250, 300" }), {
      clientX: 250,
      clientY: 300
    });

    const menu = screen.getByRole("menu", { name: "Marker actions" });
    expect(menu.style.maxHeight).toBe("420px");
    expect(menu.style.overflowY).toBe("auto");
  });

  it("shows bridge, canal, and tunnel hover details in normal mode while keeping marker actions behind roadway edit mode", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "bridge-1",
          name: "Cedar Bridge",
          notes: "River crossing",
          points: [
            { x: 100, y: 120 },
            { x: 140, y: 120 }
          ],
          type: "bridge",
          width: 2,
          x: 100,
          y: 120
        },
        {
          id: "canal-1",
          name: "West Canal",
          notes: "Boat route",
          points: [
            { x: 110, y: 150 },
            { x: 150, y: 150 }
          ],
          type: "canal",
          width: 2,
          x: 110,
          y: 150
        },
        {
          id: "tunnel-1",
          name: "North Tunnel",
          notes: "Mine route",
          points: [
            { x: 130, y: 180 },
            { x: 170, y: 180 }
          ],
          type: "tunnel",
          width: 2,
          x: 130,
          y: 180
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const bridge = screen.getByTestId("path-marker-bridge-1");
    const canal = screen.getByTestId("path-marker-canal-1");
    const tunnel = screen.getByTestId("path-marker-tunnel-1");
    fireEvent.mouseMove(bridge, {
      clientX: 120,
      clientY: 121
    });

    let pathDetails = screen.getByRole("tooltip", { name: "Map items at 120, 121" });
    expect(within(pathDetails).getByText("Cedar Bridge")).toBeTruthy();
    expect(within(pathDetails).getByText("Bridge | 2 points | Width 2")).toBeTruthy();

    fireEvent.mouseMove(canal, {
      clientX: 130,
      clientY: 151
    });
    pathDetails = screen.getByRole("tooltip", { name: "Map items at 130, 151" });
    expect(within(pathDetails).getByText("West Canal")).toBeTruthy();
    expect(within(pathDetails).getByText("Canal | 2 points | Width 2")).toBeTruthy();

    fireEvent.mouseMove(tunnel, {
      clientX: 140,
      clientY: 181
    });
    pathDetails = screen.getByRole("tooltip", { name: "Map items at 140, 181" });
    expect(within(pathDetails).getByText("North Tunnel")).toBeTruthy();
    expect(within(pathDetails).getByText("Tunnel | 2 points | Width 2")).toBeTruthy();

    fireEvent.contextMenu(bridge, {
      clientX: 120,
      clientY: 121
    });
    expect(screen.queryByRole("menu", { name: "Marker actions" })).toBeNull();
  });

  it("uses roadway edit mode before paths expose marker actions", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "bridge-1",
          name: "Cedar Bridge",
          notes: "River crossing",
          points: [
            { x: 100, y: 120 },
            { x: 140, y: 120 }
          ],
          type: "bridge",
          width: 2,
          x: 100,
          y: 120
        },
        {
          id: "canal-1",
          name: "West Canal",
          notes: "Boat route",
          points: [
            { x: 110, y: 150 },
            { x: 150, y: 150 }
          ],
          type: "canal",
          width: 2,
          x: 110,
          y: 150
        },
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

    expect(screen.queryByRole("checkbox", { name: "Highway Details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(within(screen.getByRole("group", { name: "Map Layers" })).queryByRole("checkbox", { name: "Highway Details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const bridge = screen.getByTestId("path-marker-bridge-1");
    const canal = screen.getByTestId("path-marker-canal-1");
    const highway = screen.getByTestId("path-marker-highway-1");

    for (const path of [bridge, canal, highway]) {
      fireEvent.contextMenu(path, {
        clientX: 150,
        clientY: 130
      });
    }
    expect(screen.queryByRole("menu", { name: "Marker actions" })).toBeNull();

    fireEvent.pointerDown(screen.getByTestId("map-stage"), { button: 0, pointerId: 1 });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Map actions" })).toBeNull());

    expect(screen.queryByRole("group", { name: "Roadway Edit Mode" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const roadwayEditPanel = within(screen.getByRole("dialog", { name: "Settings" }))
      .getByRole("group", { name: "Roadway Edit Mode" });
    const roadwayEditToggle = within(roadwayEditPanel).getByRole("checkbox", { name: "Roadway Edit Mode" });
    expect(roadwayEditToggle).toHaveProperty("checked", false);
    fireEvent.click(roadwayEditToggle);
    expect(roadwayEditToggle).toHaveProperty("checked", true);

    fireEvent.mouseMove(bridge, {
      clientX: 150,
      clientY: 130
    });
    let pathDetails = screen.getByRole("tooltip", { name: "Map items at -724, -764" });
    expect(within(pathDetails).getByText("Cedar Bridge")).toBeTruthy();
    expect(within(pathDetails).getByText("Bridge | 2 points | Width 2")).toBeTruthy();
    fireEvent.mouseMove(canal, {
      clientX: 150,
      clientY: 130
    });
    pathDetails = screen.getByRole("tooltip", { name: "Map items at -724, -764" });
    expect(within(pathDetails).getByText("West Canal")).toBeTruthy();
    expect(within(pathDetails).getByText("Canal | 2 points | Width 2")).toBeTruthy();
    fireEvent.mouseMove(highway, {
      clientX: 150,
      clientY: 130
    });
    pathDetails = screen.getByRole("tooltip", { name: "Map items at -724, -764" });
    expect(within(pathDetails).getByText("East Road")).toBeTruthy();
    expect(within(pathDetails).getByText("Highway | 2 points | Width 2")).toBeTruthy();

    fireEvent.contextMenu(bridge, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
    fireEvent.contextMenu(canal, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
    fireEvent.contextMenu(highway, {
      clientX: 150,
      clientY: 130
    });
    expect(screen.getByRole("menu", { name: "Marker actions" })).toBeTruthy();
  });

  it("shows tower name labels until the tower is hovered for details", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expandLayerCategory("Markers");
    fireEvent.click(screen.getByRole("checkbox", { name: "Tower Names" }));

    const label = screen.getByTestId("tower-name-label-tower-1");
    expect(label.textContent).toBe("Mako 945");
    expect(screen.queryByRole("tooltip", { name: "Map items at 420, 430" })).toBeNull();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }), {
      clientX: 420,
      clientY: 430
    });

    expect(screen.queryByTestId("tower-name-label-tower-1")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "Map items at 420, 430" })).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Tower by Mako 945 at 250, 300" }));

    await waitFor(() => expect(screen.getByTestId("tower-name-label-tower-1").textContent).toBe("Mako 945"));
  });

  it("shows deed name labels until the deed is hovered for details", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expandLayerCategory("Markers");
    fireEvent.click(screen.getByRole("checkbox", { name: "Deed Names" }));

    const label = screen.getByTestId("deed-name-label-deed-1");
    expect(label.textContent).toBe("Oak Harbour");
    expect(screen.queryByRole("tooltip", { name: "Map items at 420, 430" })).toBeNull();

    fireEvent.mouseMove(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" }), {
      clientX: 420,
      clientY: 430
    });

    expect(screen.queryByTestId("deed-name-label-deed-1")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "Map items at 420, 430" })).toBeTruthy();

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" }));

    await waitFor(() => expect(screen.getByTestId("deed-name-label-deed-1").textContent).toBe("Oak Harbour"));
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
    expect(window.location.href).toBe(`${window.location.origin}/map?server=1&x=125&y=140`);
  });

  it("plans one temporary route with tile and meter distance", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    const routeButton = screen.getByRole("button", { name: "Route planner" });
    expect(routeButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(routeButton);
    expect(routeButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.doubleClick(stage, {
      clientX: 100,
      clientY: 100
    });

    expect(screen.getByTestId("route-planner-layer")).toBeTruthy();
    expect(screen.getByText("0 tiles")).toBeTruthy();
    expect(screen.getByText("0 meters")).toBeTruthy();
    expect(screen.getByText("Time --")).toBeTruthy();

    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 103,
      clientY: 104,
      pointerId: 11
    });
    fireEvent.pointerUp(window, {
      clientX: 103,
      clientY: 104,
      pointerId: 11
    });
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 106,
      clientY: 108,
      pointerId: 12
    });
    fireEvent.pointerUp(window, {
      clientX: 106,
      clientY: 108,
      pointerId: 12
    });

    expect(screen.getByTestId("route-planner-line").getAttribute("points")).toBe("100.5,100.5 103.5,104.5 106.5,108.5");
    expect(screen.getByText("8 tiles")).toBeTruthy();
    expect(screen.getByText("32 meters")).toBeTruthy();
    expect(screen.getByText("Time --")).toBeTruthy();

    fireEvent.doubleClick(stage, {
      clientX: 150,
      clientY: 160
    });

    expect(screen.queryByTestId("route-planner-layer")).toBeNull();
    expect(screen.queryByText("8 tiles")).toBeNull();
  });

  it("measures route segments using Wurm tile range semantics", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "1.25",
          id: "tower-1",
          makerName: "Mako",
          makerNumber: "945",
          ql: "88.50",
          type: "tower",
          x: 100,
          y: 100
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");
    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.click(screen.getByRole("button", { name: "Route planner" }));
    fireEvent.doubleClick(stage, {
      clientX: 100,
      clientY: 100
    });
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 150,
      clientY: 150,
      pointerId: 41
    });
    fireEvent.pointerUp(window, {
      clientX: 150,
      clientY: 150,
      pointerId: 41
    });

    expect(screen.getByTestId("tower-placement-border-right-tower-1")).toBeTruthy();
    expect(screen.getByText("50 tiles")).toBeTruthy();
    expect(screen.getByText("200 meters")).toBeTruthy();
    expect(screen.queryByText("70.7 tiles")).toBeNull();
  });

  it("persists route planner speed and estimates travel time", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        routePlannerSpeedKmh: 8
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");
    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.click(screen.getByRole("button", { name: "Route planner" }));

    const speedInput = screen.getByRole("spinbutton", { name: "Speed" });
    expect(speedInput).toHaveProperty("value", "8");

    fireEvent.doubleClick(stage, {
      clientX: 100,
      clientY: 100
    });
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 103,
      clientY: 104,
      pointerId: 31
    });
    fireEvent.pointerUp(window, {
      clientX: 103,
      clientY: 104,
      pointerId: 31
    });
    fireEvent.pointerDown(stage, {
      button: 0,
      clientX: 106,
      clientY: 108,
      pointerId: 32
    });
    fireEvent.pointerUp(window, {
      clientX: 106,
      clientY: 108,
      pointerId: 32
    });

    expect(screen.getByText("8 tiles")).toBeTruthy();
    expect(screen.getByText("32 meters")).toBeTruthy();
    expect(screen.getByText("Time 14 sec")).toBeTruthy();

    fireEvent.change(speedInput, { target: { value: "99" } });

    expect(speedInput).toHaveProperty("value", "60");
    expect(screen.getByText("Time 2 sec")).toBeTruthy();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        body: expect.stringContaining("\"routePlannerSpeedKmh\":60"),
        method: "PATCH"
      })
    ));
  });

  it("plans routes over map marker overlays", async () => {
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

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    fireEvent.click(screen.getByRole("button", { name: "Route planner" }));
    const deedOverlay = screen.getByTestId("deed-overlay-deed-1");

    fireEvent.doubleClick(deedOverlay, {
      clientX: 500,
      clientY: 600
    });
    fireEvent.pointerDown(deedOverlay, {
      button: 0,
      clientX: 503,
      clientY: 604,
      pointerId: 21
    });
    fireEvent.pointerUp(window, {
      clientX: 503,
      clientY: 604,
      pointerId: 21
    });

    expect(screen.getByTestId("route-planner-line").getAttribute("points")).toBe("500.5,600.5 503.5,604.5");
    expect(screen.getByText("4 tiles")).toBeTruthy();
    expect(screen.getByText("16 meters")).toBeTruthy();
  });

  it("clears the planned route when the planner is toggled off", async () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    const stage = screen.getByTestId("map-stage");

    await waitFor(() => expect(stage.dataset.zoom).toBe("1"));

    const routeButton = screen.getByRole("button", { name: "Route planner" });
    fireEvent.click(routeButton);
    fireEvent.doubleClick(stage, {
      clientX: 100,
      clientY: 100
    });

    expect(screen.getByTestId("route-planner-layer")).toBeTruthy();

    fireEvent.click(routeButton);

    expect(routeButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("route-planner-layer")).toBeNull();
  });

  it("shows a map legend with the current marker colors", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      initialSettings: {
        ...DEFAULT_USER_MAP_SETTINGS,
        markerColors: {
          ...DEFAULT_USER_MAP_SETTINGS.markerColors,
          bridges: "#d946ef",
          camps: "#f59e0b",
          canals: "#2563eb",
          deeds: "#facc15",
          highways: "#fde047",
          locateSouls: "#f97316",
          minedoors: "#06b6d4",
          notes: "#ff2bd6",
          rifts: "#dc2626",
          towers: "#ffffff"
        }
      },
      map: activeMap,
      viewer: approvedViewer
    }));

    const legendButton = screen.getByRole("button", { name: "Map legend" });
    expect(legendButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(legendButton);

    expect(legendButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Map legend" })).toBeTruthy();
    expect(screen.getByText("Tower")).toBeTruthy();
    expect(screen.getByText("Deed")).toBeTruthy();
    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByText("Rift")).toBeTruthy();
    expect(screen.getByText("Camp")).toBeTruthy();
    expect(screen.getByText("Minedoor")).toBeTruthy();
    expect(screen.getByText("Locate Soul")).toBeTruthy();
    expect(screen.getByText("Bridge")).toBeTruthy();
    expect(screen.getByText("Canal")).toBeTruthy();
    expect(screen.getByText("Highway")).toBeTruthy();
    expect(screen.getByTestId("legend-symbol-rift").style.getPropertyValue("--map-legend-color")).toBe("#dc2626");
    expect(screen.getByTestId("legend-symbol-camp").style.getPropertyValue("--map-legend-color")).toBe("#f59e0b");
    expect(screen.getByTestId("legend-symbol-minedoor").style.getPropertyValue("--map-legend-color")).toBe("#06b6d4");
    expect(screen.getByTestId("legend-symbol-locate-soul").style.getPropertyValue("--map-legend-color")).toBe("#f97316");
    expect(screen.getByTestId("legend-symbol-bridge").style.getPropertyValue("--map-legend-color")).toBe("#d946ef");
    expect(screen.getByTestId("legend-symbol-canal").style.getPropertyValue("--map-legend-color")).toBe("#2563eb");
    expect(screen.getByTestId("legend-symbol-highway").style.getPropertyValue("--map-legend-color")).toBe("#fde047");
  });

  it("renders only bottom-left map tools on the map surface", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [],
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(document.querySelector(".map-right-side-controls")).toBeNull();
    expect(screen.queryByRole("group", { name: "Tile Highlighting" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Roadway Edit Mode" })).toBeNull();

    const bottomLeftControls = document.querySelector(".map-bottom-left-controls");
    expect(Array.from(bottomLeftControls?.children ?? []).map((child) => child.className)).toEqual([
      "map-legend-control",
      "map-route-planner-control",
      "map-event-feed-control",
      "map-share-control"
    ]);
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

  it("persists search line preference and draws lines from the selected coordinate to search matches", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

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
          text: "Oak mine",
          title: "Oak mine",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    expect(screen.queryByRole("checkbox", { name: "Search Lines" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const searchLinesCheckbox = getLayerControls().getByRole("checkbox", { name: "Search Lines" });
    expect(searchLinesCheckbox).toHaveProperty("checked", false);
    expect(screen.queryByTestId("search-line-layer")).toBeNull();

    fireEvent.contextMenu(screen.getByTestId("map-stage"), {
      clientX: 100,
      clientY: 120
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search map" }), {
      target: { value: "oak" }
    });

    expect(screen.queryByTestId("search-line-layer")).toBeNull();

    fireEvent.click(searchLinesCheckbox);

    const layer = screen.getByTestId("search-line-layer");
    expect(within(layer).getAllByTestId("search-line")).toHaveLength(2);
    const deedLine = layer.querySelector("[data-search-line-id='deed-1']");
    expect(deedLine?.getAttribute("x1")).toBe("1024");
    expect(deedLine?.getAttribute("y1")).toBe("1024");
    expect(deedLine?.getAttribute("x2")).toBe("1424");
    expect(deedLine?.getAttribute("y2")).toBe("1504");

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/maps/map-1/settings",
      expect.objectContaining({
        body: expect.stringContaining("\"searchLinesEnabled\":true"),
        method: "PATCH"
      })
    ));
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
        },
        {
          casterFacing: "north",
          direction: "aheadLeft",
          distanceBand: "50-199",
          id: "locate-soul-1",
          notes: "Corpse result",
          targetName: "Funkiey",
          type: "locateSoul",
          x: 930,
          y: 1030
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

    fireEvent.change(searchbox, { target: { value: "locate soul funkiey" } });
    expect(screen.queryByRole("button", { name: "Rift at 900, 1000" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Camp Goblin at 910, 1010" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Minedoor at 920, 1020" })).toBeNull();
    expect(screen.getByRole("button", { name: "Locate Soul Funkiey at 930, 1030" })).toBeTruthy();
    expect(screen.getByTestId("locate-soul-marker-locate-soul-1").className).toContain("map-search-match");
  });

  it("does not search infrastructure paths by type, name, notes, or coordinates", () => {
    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          id: "bridge-1",
          name: "Cedar Bridge",
          notes: "River crossing 777",
          points: [
            { x: 100, y: 120 },
            { x: 140, y: 120 }
          ],
          type: "bridge",
          width: 2,
          x: 100,
          y: 120
        },
        {
          id: "canal-1",
          name: "West Canal",
          notes: "Boat route",
          points: [
            { x: 110, y: 150 },
            { x: 150, y: 150 }
          ],
          type: "canal",
          width: 2,
          x: 110,
          y: 150
        },
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
        },
        {
          category: "General",
          id: "note-1",
          text: "Cedar Bridge reminder",
          title: "Roadway note",
          type: "note",
          x: 700,
          y: 800
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    const searchbox = screen.getByRole("searchbox", { name: "Search map" });

    fireEvent.change(searchbox, { target: { value: "bridge" } });
    expect(screen.getByRole("button", { name: "Note General - Roadway note at 700, 800" })).toBeTruthy();
    expect(screen.queryByTestId("path-marker-bridge-1")).toBeNull();
    expect(screen.queryByTestId("path-marker-canal-1")).toBeNull();
    expect(screen.queryByTestId("path-marker-highway-1")).toBeNull();

    fireEvent.change(searchbox, { target: { value: "Boat route" } });
    expect(screen.queryByTestId("path-marker-canal-1")).toBeNull();

    fireEvent.change(searchbox, { target: { value: "120" } });
    expect(screen.queryByTestId("path-marker-highway-1")).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
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
    const clipboardWrite = mockClipboardWrite();

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
        {
          damage: "0.25",
          id: "tower-1",
          lastModifiedBy: "Alyeska",
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
    const coordinateCopyButton = screen.getByRole("menuitem", { name: "Copy link to 250, 300" });
    expect(screen.getByText("1 item at 250, 300").closest("button")).toBe(coordinateCopyButton);
    expect(coordinateCopyButton.querySelector(".map-context-coordinate-icon")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Copy coordinates 250, 300" })).toBeNull();
    fireEvent.click(coordinateCopyButton);
    expect(clipboardWrite).toHaveBeenLastCalledWith(`${window.location.origin}/map?server=1&x=250&y=300`);
    expect(screen.getByTestId("context-marker-row-tower-1")).toBeTruthy();
    expect(screen.getByText("Mako 945")).toBeTruthy();
    expect(screen.getByText("Tower | QL 89.50 | DMG 0.25")).toBeTruthy();
    expect(screen.getByText("Tower type: Freedom Isles")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-tower-1").style.getPropertyValue("--map-context-marker-color")).toBe("#ffffff");
    expect(window.location.href).toBe(`${window.location.origin}/map?server=1&x=250&y=300`);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Tower Mako 945" }));

    expect(screen.getByRole("dialog", { name: "Edit Tower" })).toBeTruthy();
    expect(screen.getByLabelText("Creator")).toHaveProperty("value", "Mako 945");
    expect(screen.getByText("Last Modified")).toBeTruthy();
    expect(screen.getByText("Alyeska")).toBeTruthy();
    expect(screen.queryByLabelText("Last Modified")).toBeNull();
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

  it("lists overlay-covered marker pips from the marker context menu", () => {
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
        },
        {
          category: "General",
          id: "note-1",
          text: "Hidden under the deed overlay",
          title: "Buried note",
          type: "note",
          x: 503,
          y: 604
        }
      ],
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByTestId("deed-overlay-deed-1"), {
      clientX: 504,
      clientY: 605
    });

    const menu = screen.getByRole("menu", { name: "Marker actions" });
    expect(menu).toBeTruthy();
    expect(screen.getByText("2 items at 504, 605")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-note-1")).toBeTruthy();
    expect(screen.getByText("Buried note")).toBeTruthy();
    expect(screen.getByText("Note | General")).toBeTruthy();
    expect(screen.getByTestId("context-marker-row-deed-1")).toBeTruthy();
    expect(screen.getByText("Oak Harbour")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Note General - Buried note" }));

    expect(screen.getByRole("dialog", { name: "Edit Note General - Buried note" })).toBeTruthy();
  });

  it("marks an edited deed as disbanded and replaces it with an abandoned deed note", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        category: {
          id: "category-abandoned",
          name: "Abandoned Deed"
        },
        deletedMarkerId: "deed-1",
        marker: {
          category: "Abandoned Deed",
          id: "note-1",
          text: [
            "Former deed: Oak Harbour",
            "Mayor: Mayor",
            "Founding date: 2026-05-10",
            "Dimensions: N5 W5 E5 S5",
            "Perimeter: 5 tiles"
          ].join("\n"),
          title: "Oak Harbour",
          type: "note",
          x: 500,
          y: 600
        }
      }),
      ok: true
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(MapWorkspace, {
      initialMarkers: [
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
          x: 500,
          y: 600
        }
      ],
      initialNoteCategories: noteCategories,
      map: activeMap,
      viewer: approvedViewer
    }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Deed Oak Harbour at 500, 600" }), {
      clientX: 500,
      clientY: 600
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Deed Oak Harbour" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Disbanded" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/markers/deed/deed-1/disband",
      { method: "POST" }
    ));
    expect(screen.queryByRole("button", { name: "Deed Oak Harbour at 500, 600" })).toBeNull();
    expect(screen.getByRole("button", { name: "Note Abandoned Deed - Oak Harbour at 500, 600" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Edit Deed" })).toBeNull();
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
