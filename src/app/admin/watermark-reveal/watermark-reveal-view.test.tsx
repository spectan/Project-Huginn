import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { WatermarkRevealView } from "./watermark-reveal-view";

const users = [
  { id: "user-1", username: "Mako", watermarkNumber: 7 },
  { id: "user-2", username: "Stargrace", watermarkNumber: 123 },
  { id: "user-3", username: null, watermarkNumber: null }
];

describe("WatermarkRevealView", () => {
  it("renders a reference table of padded watermark numbers to usernames", () => {
    render(React.createElement(WatermarkRevealView, { users }));

    expect(screen.getByRole("heading", { name: "Watermark" })).toBeTruthy();
    expect(screen.getByText("0007")).toBeTruthy();
    expect(screen.getByText("0123")).toBeTruthy();
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.getByText("Stargrace")).toBeTruthy();
    expect(screen.queryByText("user-3")).toBeNull();
  });

  it("highlights the matching row as digits are typed", () => {
    render(React.createElement(WatermarkRevealView, { users }));

    const digitsInput = screen.getByLabelText("Digits");
    fireEvent.change(digitsInput, { target: { value: "123" } });

    const stargraceRow = screen.getByText("Stargrace").closest("tr");
    const makoRow = screen.getByText("Mako").closest("tr");
    expect(stargraceRow?.getAttribute("data-matched")).toBe("true");
    expect(makoRow?.getAttribute("data-matched")).toBeNull();

    fireEvent.change(digitsInput, { target: { value: "0007" } });

    expect(makoRow?.getAttribute("data-matched")).toBe("true");
    expect(stargraceRow?.getAttribute("data-matched")).toBeNull();

    fireEvent.change(digitsInput, { target: { value: "9999" } });

    expect(makoRow?.getAttribute("data-matched")).toBeNull();
    expect(stargraceRow?.getAttribute("data-matched")).toBeNull();
  });

  it("posts the uploaded image and renders both enhanced previews", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        saturationPreview: "data:image/png;base64,c2F0dXJhdGlvbg==",
        chromaPreview: "data:image/png;base64,Y2hyb21h"
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(React.createElement(WatermarkRevealView, { users }));

    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Screenshot or frame"), { target: { files: [file] } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: FormData; method: string }];
    expect(url).toBe("/api/admin/watermark-reveal");
    expect(init.method).toBe("POST");
    expect(init.body.get("image")).toBeTruthy();

    expect(await screen.findByAltText("Saturation-boosted watermark preview")).toBeTruthy();
    expect(screen.getByAltText("Chroma-isolated watermark preview")).toBeTruthy();
    expect(screen.getByText("Saturation boost")).toBeTruthy();
    expect(screen.getByText("Chroma isolation")).toBeTruthy();
  });
});
