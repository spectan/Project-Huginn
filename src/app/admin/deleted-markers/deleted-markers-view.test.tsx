import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeletedMarkersView } from "./deleted-markers-view";

const deletedMarkers = [
  {
    deletedAt: "2026-05-10T10:00:00.000Z",
    deletedByUsername: "Writer",
    deleteExpiresAt: "2026-05-10T13:00:00.000Z",
    id: "tower-1",
    label: "Mako 945",
    mapName: "Wurm",
    type: "tower",
    x: 100,
    y: 200
  }
] as const;

describe("DeletedMarkersView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders deleted marker restore rows", () => {
    render(React.createElement(DeletedMarkersView, { markers: deletedMarkers }));

    expect(screen.getByRole("heading", { name: "Deleted markers" })).toBeTruthy();
    expect(screen.getByText("Mako 945")).toBeTruthy();
    expect(screen.getByText("100, 200")).toBeTruthy();
    expect(screen.getByText("Writer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore Mako 945" })).toBeTruthy();
  });

  it("renders an empty state when no markers can be restored", () => {
    render(React.createElement(DeletedMarkersView, { markers: [] }));

    expect(screen.getByText("No restorable deleted markers")).toBeTruthy();
  });

  it("calls the restore API and reloads after a successful restore", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    const reloadMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock }
    });

    render(React.createElement(DeletedMarkersView, { markers: deletedMarkers }));

    fireEvent.click(screen.getByRole("button", { name: "Restore Mako 945" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/deleted-markers/tower/tower-1/restore",
      { method: "POST" }
    ));
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
