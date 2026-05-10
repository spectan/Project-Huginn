import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("map overlay styles", () => {
  it.each([
    ".map-tower-zone--protection",
    ".map-tower-zone--placement",
    ".map-deed-overlay"
  ])("%s uses fill-only rendering so zoomed overlays stay crisp", (selector) => {
    const block = getCssBlock(selector);

    expect(block).toContain("background:");
    expect(block).not.toContain("outline");
    expect(block).not.toContain("border");
    expect(block).not.toContain("box-shadow");
  });

  it("renders marker hover details with dark map UI styling", () => {
    const block = getCssBlock(".map-hover-details");

    expect(block).toContain("background: rgba(15, 23, 42");
    expect(block).toContain("color: #e5e7eb");
  });

  it.each([
    ".map-context-menu",
    ".map-marker-dialog"
  ])("%s uses dark menu styling", (selector) => {
    const block = getCssBlock(selector);

    expect(block).toContain("background: rgba(15, 23, 42");
    expect(block).toContain("color: #e5e7eb");
  });

  it("defines a radiating search match highlight", () => {
    const block = getCssBlock(".map-search-match");

    expect(block).toContain("animation:");
  });

  it("keeps marker dialogs inside the viewport with scrollable content", () => {
    const block = getCssBlock(".map-marker-dialog");

    expect(block).toContain("max-height: calc(100vh - 88px)");
    expect(block).toContain("overflow-y: auto");
  });

  it("collapses deed dimension fields on narrow screens", () => {
    const narrowBlock = getCssBlockInMedia("(max-width: 460px)", ".map-position-fields");

    expect(narrowBlock).toContain("grid-template-columns: 1fr");
  });

  it("sizes admin header map links as stable buttons", () => {
    const block = getCssBlock(".history-header a");

    expect(block).toContain("display: inline-flex");
    expect(block).toContain("align-items: center");
    expect(block).toContain("line-height: 1");
    expect(block).toContain("box-sizing: border-box");
  });
});

function getCssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  if (!match || match[1] === undefined) {
    throw new Error(`Missing CSS block for ${selector}`);
  }

  return match[1];
}

function getCssBlockInMedia(mediaCondition: string, selector: string): string {
  const escapedCondition = mediaCondition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(
    new RegExp(`@media\\s+${escapedCondition}\\s*\\{[\\s\\S]*?${escapedSelector}\\s*\\{([^}]*)\\}`)
  );

  if (!match || match[1] === undefined) {
    throw new Error(`Missing CSS block for ${selector} in @media ${mediaCondition}`);
  }

  return match[1];
}
