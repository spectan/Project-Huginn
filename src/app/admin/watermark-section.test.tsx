import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { WatermarkSection } from "./watermark-section";

const users = [
  { id: "user-1", username: "Mako", watermarkNumber: 7 },
  { id: "user-2", username: "Stargrace", watermarkNumber: 123 },
  { id: "user-3", username: null, watermarkNumber: null }
];

describe("WatermarkSection", () => {
  it("renders the compact drop zone without a reference table", () => {
    render(React.createElement(WatermarkSection, { users }));

    expect(screen.getByRole("heading", { name: "Watermark" })).toBeTruthy();
    expect(screen.getByLabelText(/Paste or drop a screenshot/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("0007")).toBeNull();
    expect(screen.queryByText("Mako")).toBeNull();
    expect(screen.queryByText("Stargrace")).toBeNull();
  });

  it("shows the matching username as digits are typed, or 'No match'", () => {
    render(React.createElement(WatermarkSection, { users }));

    const digitsInput = screen.getByLabelText("UserID");

    fireEvent.change(digitsInput, { target: { value: "123" } });
    expect(screen.getByText("Stargrace")).toBeTruthy();

    fireEvent.change(digitsInput, { target: { value: "0007" } });
    expect(screen.getByText("Mako")).toBeTruthy();
    expect(screen.queryByText("Stargrace")).toBeNull();

    fireEvent.change(digitsInput, { target: { value: "9999" } });
    expect(screen.getByText("No match")).toBeTruthy();

    fireEvent.change(digitsInput, { target: { value: "" } });
    expect(screen.queryByText("No match")).toBeNull();
  });

  it("posts the uploaded image and renders the enhanced preview", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        preview: "data:image/png;base64,Y2hyb21h"
      }),
      ok: true
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(React.createElement(WatermarkSection, { users }));

    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Paste or drop a screenshot/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: FormData; method: string }];
    expect(url).toBe("/api/admin/watermark-reveal");
    expect(init.method).toBe("POST");
    expect(init.body.get("image")).toBeTruthy();

    expect(await screen.findByAltText("Chroma-isolated watermark preview")).toBeTruthy();
    expect(screen.getByText("Chroma isolation")).toBeTruthy();
    expect(screen.queryByText("Saturation boost")).toBeNull();
  });
});
