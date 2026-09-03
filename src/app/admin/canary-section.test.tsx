import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CanarySection } from "./canary-section";

describe("CanarySection", () => {
  it("renders the dump textarea with a disabled identify button until text is entered", () => {
    render(React.createElement(CanarySection));

    expect(screen.getByRole("heading", { name: "Canaries" })).toBeTruthy();
    expect(screen.getByLabelText(/Paste a leaked marker dump/)).toBeTruthy();

    const button = screen.getByRole("button", { name: "Identify" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Paste a leaked marker dump/), {
      target: { value: "dump" }
    });
    expect(button.disabled).toBe(false);
  });

  it("posts the dump and renders the matches", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        matches: [
          {
            hits: [
              { slot: 0, type: "tower", x: 111, y: 222 },
              { slot: 1, type: "note", x: 333, y: 444 }
            ],
            mapId: "map-1",
            mapName: "Independence",
            userId: "user-1",
            username: "Mako"
          }
        ]
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(React.createElement(CanarySection));

    fireEvent.change(screen.getByLabelText(/Paste a leaked marker dump/), {
      target: { value: "leaked dump" }
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string; method: string }
    ];
    expect(url).toBe("/api/admin/canaries/identify");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ text: "leaked dump" });

    expect(await screen.findByText("Mako")).toBeTruthy();
    expect(screen.getByText("Independence")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("tower (111, 222)")).toBeTruthy();
    expect(screen.getByText("note (333, 444)")).toBeTruthy();
  });

  it("shows the empty state when nothing matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ matches: [] }),
        ok: true
      }))
    );

    const { container } = render(React.createElement(CanarySection));

    fireEvent.change(screen.getByLabelText(/Paste a leaked marker dump/), {
      target: { value: "unrelated dump" }
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("No canary matches found.")).toBeTruthy();
  });

  it("shows the server error when identification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ error: "Text is required" }),
        ok: false
      }))
    );

    const { container } = render(React.createElement(CanarySection));

    fireEvent.change(screen.getByLabelText(/Paste a leaked marker dump/), {
      target: { value: "dump" }
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Text is required")).toBeTruthy();
  });
});
