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

  it("renders deed name labels with dark map UI styling", () => {
    const block = getStandaloneCssBlock(".map-deed-name-label");

    expect(block).toContain("background: rgba(15, 23, 42");
    expect(block).toContain("border: 1px solid rgba(148, 163, 184, 0.28)");
    expect(block).toContain("color: #e5e7eb");
    expect(block).not.toContain("#112244");
    expect(block).not.toContain("#d6a76f");
    expect(block).not.toContain("#ffddaa");
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

  it("renders settings controls as compact layer rows", () => {
    const controlsBlock = getStandaloneCssBlock(".map-layer-controls");
    const rowBlock = getStandaloneCssBlock(".map-layer-row");
    const colorBlock = getStandaloneCssBlock(".map-layer-color");

    expect(controlsBlock).toContain("display: grid");
    expect(rowBlock).toContain("grid-template-columns: 18px minmax(0, 1fr) 42px minmax(72px, 1fr)");
    expect(rowBlock).toContain("min-height: 30px");
    expect(rowBlock).toContain("align-items: center");
    expect(colorBlock).toContain("justify-self: end");
    expect(globalsCss).not.toContain(".map-visibility-controls");
    expect(globalsCss).not.toContain(".map-color-controls");
  });

  it("keeps map settings opacity sliders contained inside compact rows", () => {
    const rowBlock = getStandaloneCssBlock(".map-layer-row");
    const opacityBlock = getStandaloneCssBlock(".map-layer-opacity");

    expect(rowBlock).toContain("grid-template-columns: 18px minmax(0, 1fr) 42px minmax(72px, 1fr)");
    expect(opacityBlock).toContain("box-sizing: border-box");
    expect(opacityBlock).toContain("min-width: 0");
    expect(opacityBlock).toContain("max-width: 100%");
  });

  it("uses configurable grid colors with black grid edging", () => {
    const sectorBlock = getStandaloneCssBlock(".map-sector-grid");
    const missionBlock = getStandaloneCssBlock(".map-mission-grid");

    expect(sectorBlock).toContain("var(--map-sector-grid-color, #ffffff)");
    expect(sectorBlock).toContain("#000000");
    expect(sectorBlock).not.toContain("rgba(255, 255, 255");
    expect(missionBlock).toContain("var(--map-mission-grid-color, #22c55e)");
    expect(missionBlock).toContain("#000000");
    expect(missionBlock).not.toContain("rgba(250, 204, 21");
  });

  it("centers sector grid labels inside each grid cell", () => {
    const block = getStandaloneCssBlock(".map-sector-grid span");

    expect(block).toContain("display: flex");
    expect(block).toContain("align-items: center");
    expect(block).toContain("justify-content: center");
    expect(block).toContain("padding: 0");
    expect(block).not.toContain("padding-top");
    expect(block).not.toContain("padding-left");
  });

  it("renders the selected coordinate as a compact pin instead of an obscuring crosshair", () => {
    const block = getStandaloneCssBlock(".map-selected-reticule");
    const centerBlock = getStandaloneCssBlock(".map-selected-reticule::before");

    expect(block).toContain("width: 18px");
    expect(block).toContain("height: 18px");
    expect(block).toContain("border-radius: 50% 50% 50% 0");
    expect(block).toContain("background: #facc15");
    expect(block).toContain("border: 2px solid #92400e");
    expect(block).not.toContain("width: 34px");
    expect(block).not.toContain("height: 34px");
    expect(centerBlock).toContain("border-radius: 50%");
    expect(globalsCss).not.toContain(".map-selected-reticule::after");
    expect(globalsCss).not.toContain("height: 48px");
    expect(globalsCss).not.toContain("width: 48px");
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

function getStandaloneCssBlock(selector: string): string {
  const lines = globalsCss.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== `${selector} {`) {
      continue;
    }

    const previousLine = findPreviousNonEmptyLine(lines, index);

    if (previousLine.endsWith(",")) {
      continue;
    }

    const blockLines = [];

    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      if (lines[blockIndex]?.trim() === "}") {
        return blockLines.join("\n");
      }

      blockLines.push(lines[blockIndex]);
    }
  }

  throw new Error(`Missing standalone CSS block for ${selector}`);
}

function findPreviousNonEmptyLine(lines: string[], index: number): string {
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const line = lines[previousIndex]?.trim();

    if (line) {
      return line;
    }
  }

  return "";
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
