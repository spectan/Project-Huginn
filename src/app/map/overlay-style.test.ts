import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("map overlay styles", () => {
  it.each([
    ".map-tower-zone--protection",
    ".map-tower-zone--placement",
    ".map-deed-overlay",
    ".map-rift-overlay"
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

  it("renders deed bodies with a very transparent white fill instead of a deed-colored fill", () => {
    const block = getCssBlock(".map-deed-overlay");

    expect(block).toContain("background: rgba(255, 255, 255, 0.18)");
    expect(block).not.toContain("radial-gradient");
    expect(block).not.toContain("#facc15");
  });

  it("renders tower protection as a deed-like transparent fill instead of a gradient", () => {
    const block = getStandaloneCssBlock(".map-tower-zone--protection");

    expect(block).toContain("background: rgba(255, 255, 255, 0.18)");
    expect(block).not.toContain("gradient");
    expect(block).not.toContain("--map-tower-zone-gradient");
  });

  it("renders rift bodies with a transparent white fill and separate edge strips", () => {
    const overlayBlock = getStandaloneCssBlock(".map-rift-overlay");
    const borderBlock = getStandaloneCssBlock(".map-rift-border");

    expect(overlayBlock).toContain("background: rgba(255, 255, 255, 0.18)");
    expect(overlayBlock).not.toContain("#ef4444");
    expect(borderBlock).toContain("pointer-events: none");
    expect(borderBlock).not.toContain("border:");
    expect(borderBlock).not.toContain("outline:");
  });

  it("renders deed borders and perimeters as tile edge strips", () => {
    const borderBlock = getStandaloneCssBlock(".map-deed-border");
    const perimeterBlock = getStandaloneCssBlock(".map-deed-perimeter");

    expect(borderBlock).toContain("pointer-events: none");
    expect(perimeterBlock).toContain("pointer-events: none");
    expect(borderBlock).not.toContain("border:");
    expect(perimeterBlock).not.toContain("border:");
  });

  it("renders tower outlines as non-interactive tile edge strips", () => {
    const block = getStandaloneCssBlock(".map-tower-zone-edge");

    expect(block).toContain("pointer-events: none");
    expect(block).not.toContain("border:");
    expect(block).not.toContain("outline:");
    expect(block).not.toContain("box-shadow:");
  });

  it("styles marker modifier text like marker metadata text", () => {
    const metaBlock = getStandaloneCssBlock(".map-context-marker-meta");
    const modifierBlock = getStandaloneCssBlock(".map-context-marker-modifier");

    expect(metaBlock).toContain("color: #94a3b8");
    expect(modifierBlock).toContain("color: #94a3b8");
    expect(modifierBlock).toContain("font-weight: 700");
    expect(modifierBlock).not.toContain("color: #cbd5e1");
  });

  it("styles context add submenus as nested menu groups", () => {
    const triggerBlock = getStandaloneCssBlock(".map-context-submenu-trigger");
    const panelBlock = getStandaloneCssBlock(".map-context-submenu-panel");

    expect(triggerBlock).toContain("grid-template-columns: minmax(0, 1fr) 14px");
    expect(panelBlock).toContain("border-left: 1px solid rgba(148, 163, 184, 0.22)");
    expect(panelBlock).toContain("padding-left: 8px");
  });

  it("allows direct marker buttons to receive hover and context menu events", () => {
    const block = getStandaloneCssBlock(".map-marker-layer > .map-marker");

    expect(block).toContain("pointer-events: auto");
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

  it("makes search match pings large enough to stand out on dense maps", () => {
    const block = getStandaloneCssBlock(".map-search-match");
    const keyframes = getKeyframesBlock("map-search-pulse");

    expect(block).toContain("0 0 0 6px rgba(34, 211, 238, 1)");
    expect(keyframes).toContain("0 0 0 34px rgba(34, 211, 238, 0)");
    expect(keyframes).toContain("0 0 48px rgba(34, 211, 238, 0.72)");
  });

  it("draws triangle markers inside unclipped buttons so search pulses radiate", () => {
    const campColorBlock = getStandaloneCssBlock(".map-marker--camp::before");

    expect(globalsCss).not.toMatch(/\.map-marker--rift,\s*\.map-marker--camp\s*\{[^}]*clip-path/s);
    expect(globalsCss).toMatch(/\.map-marker--rift::before,\s*\.map-marker--camp::before\s*\{[^}]*clip-path: polygon\(50% 0, 0 100%, 100% 100%\)/s);
    expect(globalsCss).not.toContain(".map-marker--rift::before {\n  background: #ef4444");
    expect(globalsCss).toContain("background: var(--map-rift-color, #ef4444)");
    expect(campColorBlock).toContain("background: var(--map-camp-color, #facc15)");
  });

  it("draws note markers as circles on the marker button so search pulses still radiate", () => {
    const noteSizingBlock = getAllStandaloneCssBlocks(".map-marker--note").find((block) => block.includes("width: 3px"));
    const searchBlock = getCssBlock(".map-search-match");

    expect(noteSizingBlock).toContain("height: 3px");
    expect(noteSizingBlock).toContain("border-radius: 50%");
    expect(searchBlock).toContain("animation:");
    expect(globalsCss).not.toContain(".map-marker--note::before");
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

  it("sizes admin nav links as stable buttons", () => {
    const block = getCssBlock(".admin-nav-link");

    expect(block).toContain("display: inline-flex");
    expect(block).toContain("align-items: center");
    expect(block).toContain("line-height: 1");
    expect(block).toContain("box-sizing: border-box");
  });

  it("renders settings controls as compact layer rows", () => {
    const controlsBlock = getStandaloneCssBlock(".map-layer-controls");
    const categoryBlock = getStandaloneCssBlock(".map-layer-category");
    const rowBlock = getStandaloneCssBlock(".map-layer-row");
    const colorBlock = getStandaloneCssBlock(".map-layer-color");
    const settingsPanelBlock = getStandaloneCssBlock(".map-settings-panel");

    expect(controlsBlock).toContain("display: grid");
    expect(controlsBlock).toContain("gap: 3px");
    expect(controlsBlock).toContain("padding: 6px");
    expect(settingsPanelBlock).toContain("width: min(330px, calc(100vw - 32px))");
    expect(settingsPanelBlock).toContain("padding: 10px");
    expect(categoryBlock).toContain("grid-column: 1 / -1");
    expect(categoryBlock).toContain("color: #cbd5e1");
    expect(categoryBlock).toContain("font-size: 11px");
    expect(categoryBlock).toContain("cursor: pointer");
    expect(categoryBlock).toContain("background: rgba(148, 163, 184, 0.12)");
    expect(categoryBlock).toContain("border: 1px solid rgba(148, 163, 184, 0.24)");
    expect(categoryBlock).toContain("letter-spacing: 0");
    expect(categoryBlock).not.toContain("#93c5fd");
    expect(rowBlock).toContain("grid-template-columns: 16px 32px minmax(0, 1fr) minmax(56px, 0.8fr)");
    expect(rowBlock).toContain("min-height: 24px");
    expect(rowBlock).toContain("font-size: 12px");
    expect(rowBlock).toContain("align-items: center");
    expect(colorBlock).toContain("justify-self: start");
    expect(colorBlock).toContain("width: 32px");
    expect(colorBlock).toContain("height: 22px");
    expect(globalsCss).not.toContain(".map-visibility-controls");
    expect(globalsCss).not.toContain(".map-color-controls");
  });

  it("keeps only the bottom-left map tools floating on the map surface", () => {
    const bottomLeftControlsBlock = getStandaloneCssBlock(".map-bottom-left-controls");
    const settingsToolGroupBlock = getStandaloneCssBlock(".map-settings-tool-group");
    const settingsToolSelectBlock = getStandaloneCssBlock(".map-settings-tool-select");
    const settingsToolSectionBlock = getStandaloneCssBlock(".map-settings-tool-section");

    expect(bottomLeftControlsBlock).toContain("flex-direction: column");
    expect(bottomLeftControlsBlock).toContain("align-items: flex-start");
    expect(settingsToolSectionBlock).toContain("margin-top: 8px");
    expect(settingsToolSectionBlock).toContain("gap: 6px");
    expect(settingsToolGroupBlock).toContain("margin: 0");
    expect(settingsToolSelectBlock).toContain("width: 100%");
    expect(settingsToolSelectBlock).toContain("min-width: 0");
    expect(globalsCss).not.toContain(".map-settings-tool-status");
    expect(globalsCss).not.toContain(".map-settings-tool-legend");
  });

  it("keeps map settings opacity sliders contained inside compact rows", () => {
    const rowBlock = getStandaloneCssBlock(".map-layer-row");
    const opacityBlock = getStandaloneCssBlock(".map-layer-opacity");

    expect(rowBlock).toContain("grid-template-columns: 16px 32px minmax(0, 1fr) minmax(56px, 0.8fr)");
    expect(opacityBlock).toContain("box-sizing: border-box");
    expect(opacityBlock).toContain("min-width: 0");
    expect(opacityBlock).toContain("max-width: 100%");
  });

  it("keeps marker form checkboxes compact instead of inheriting full-width input styling", () => {
    const fieldBlock = getStandaloneCssBlock(".map-marker-form .map-checkbox-field");
    const block = getStandaloneCssBlock(".map-marker-form .map-checkbox-field input[type=\"checkbox\"]");

    expect(fieldBlock).toContain("display: flex");
    expect(fieldBlock).toContain("align-items: center");
    expect(block).toContain("width: 14px");
    expect(block).toContain("height: 14px");
    expect(block).toContain("min-height: 0");
    expect(block).toContain("padding: 0");
  });

  it("keeps note dialog category rows separate from settings category rows", () => {
    const dialogBlock = getStandaloneCssBlock(".map-note-category-row");
    const settingsBlock = getStandaloneCssBlock(".map-note-category-settings-row");
    const settingsHeadingBlock = getStandaloneCssBlock(".map-note-category-settings-heading");
    const settingsOptionsBlock = getStandaloneCssBlock(".map-note-category-settings-options");

    expect(dialogBlock).toContain("grid-template-columns: minmax(0, 1fr) 36px");
    expect(dialogBlock).not.toContain("border-top");
    expect(settingsBlock).toContain("border-top: 1px solid rgba(148, 163, 184, 0.14)");
    expect(settingsHeadingBlock).toContain("grid-template-columns: 32px minmax(0, 1fr) auto auto");
    expect(settingsOptionsBlock).toContain("grid-template-columns: minmax(0, 1.1fr) 54px minmax(82px, 0.8fr)");
    expect(globalsCss).not.toMatch(/\.map-note-category-row\s*\{[^}]*border-top/s);
  });

  it("keeps locate soul overlays non-interactive so the 3 by 3 pip owns right-click actions", () => {
    const svgBlock = getStandaloneCssBlock(".map-locate-soul-overlay-svg");
    const overlayBlock = getStandaloneCssBlock(".map-locate-soul-overlay");

    expect(svgBlock).toContain("pointer-events: none");
    expect(overlayBlock).toContain("pointer-events: none");
  });

  it("keeps search line overlays non-interactive", () => {
    const layerBlock = getStandaloneCssBlock(".map-search-line-layer");
    const lineBlock = getStandaloneCssBlock(".map-search-line");

    expect(layerBlock).toContain("pointer-events: none");
    expect(lineBlock).toContain("pointer-events: none");
  });

  it("keeps roadway draft point handles above existing marker paths while editing", () => {
    const markerLayerBlock = getStandaloneCssBlock(".map-marker-layer");
    const draftLayerBlock = getStandaloneCssBlock(".map-path-draft-layer");
    const draftPointBlock = getStandaloneCssBlock(".map-path-draft-point");

    expect(markerLayerBlock).toContain("z-index: 5");
    expect(draftLayerBlock).toContain("z-index: 6");
    expect(draftLayerBlock).toContain("pointer-events: none");
    expect(draftPointBlock).toContain("pointer-events: auto");
  });

  it("keeps the event feed resizable and scrollable", () => {
    const panelBlock = getStandaloneCssBlock(".map-event-feed-panel");
    const listBlock = getStandaloneCssBlock(".map-event-feed-list");
    const resizeHandleBlock = getStandaloneCssBlock(".map-event-feed-resize-handle");
    const topLeftHandleBlock = getStandaloneCssBlock(".map-event-feed-resize-handle--top-left");
    const topRightHandleBlock = getStandaloneCssBlock(".map-event-feed-resize-handle--top-right");
    const bottomLeftHandleBlock = getStandaloneCssBlock(".map-event-feed-resize-handle--bottom-left");
    const bottomRightHandleBlock = getStandaloneCssBlock(".map-event-feed-resize-handle--bottom-right");

    expect(panelBlock).toContain("box-sizing: border-box");
    expect(panelBlock).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(listBlock).toContain("min-height: 0");
    expect(listBlock).toContain("overflow-y: auto");
    expect(resizeHandleBlock).toContain("position: absolute");
    expect(topLeftHandleBlock).toContain("left: 4px");
    expect(topLeftHandleBlock).toContain("top: 4px");
    expect(topLeftHandleBlock).toContain("cursor: nwse-resize");
    expect(topRightHandleBlock).toContain("right: 4px");
    expect(topRightHandleBlock).toContain("top: 4px");
    expect(topRightHandleBlock).toContain("cursor: nesw-resize");
    expect(bottomLeftHandleBlock).toContain("left: 4px");
    expect(bottomLeftHandleBlock).toContain("bottom: 4px");
    expect(bottomLeftHandleBlock).toContain("cursor: nesw-resize");
    expect(bottomRightHandleBlock).toContain("right: 4px");
    expect(bottomRightHandleBlock).toContain("bottom: 4px");
    expect(bottomRightHandleBlock).toContain("cursor: nwse-resize");
  });

  it("opens legend and event panels to the right of their bottom-left buttons", () => {
    const legendBlock = getStandaloneCssBlock(".map-legend-panel");
    const eventFeedBlock = getStandaloneCssBlock(".map-event-feed-panel");

    expect(legendBlock).toContain("left: calc(100% + 8px)");
    expect(legendBlock).toContain("bottom: 0");
    expect(eventFeedBlock).toContain("left: calc(100% + 8px)");
    expect(eventFeedBlock).toContain("bottom: 0");
    expect(legendBlock).not.toContain("bottom: calc(100% + 8px)");
    expect(eventFeedBlock).not.toContain("bottom: calc(100% + 8px)");
  });

  it("opens the route planner speed popout to the right of its button", () => {
    const popoutBlock = getStandaloneCssBlock(".map-route-planner-popout");
    const speedBlock = getStandaloneCssBlock(".map-route-planner-speed");
    const mobileBlock = getCssBlockInMedia("(max-width: 720px)", ".map-route-planner-popout");

    expect(popoutBlock).toContain("left: calc(100% + 8px)");
    expect(popoutBlock).toContain("bottom: 0");
    expect(speedBlock).toContain("grid-template-columns:");
    expect(mobileBlock).toContain("max-width: calc(100vw - 74px)");
  });

  it("reflows map chrome and popout panels on mobile viewports", () => {
    const searchBlock = getCssBlockInMedia("(max-width: 720px)", ".map-search");
    const selectionBlock = getCssBlockInMedia("(max-width: 720px)", ".map-selection-controls");
    const legendBlock = getCssBlockInMedia("(max-width: 720px)", ".map-legend-panel");
    const eventFeedBlock = getCssBlockInMedia("(max-width: 720px)", ".map-event-feed-panel");

    expect(searchBlock).toContain("right: 112px");
    expect(selectionBlock).toContain("grid-template-columns: 1fr");
    expect(legendBlock).toContain("position: fixed");
    expect(legendBlock).toContain("left: 62px");
    expect(legendBlock).toContain("bottom: max(22px, env(safe-area-inset-bottom))");
    expect(eventFeedBlock).toContain("position: fixed");
    expect(eventFeedBlock).toContain("left: 62px");
    expect(eventFeedBlock).toContain("max-height: min(60vh, calc(100vh - 96px))");
  });

  it("keeps the footer support and tip text unobtrusive at the bottom center", () => {
    const footerBlock = getStandaloneCssBlock(".map-footer-text");
    const supportLinkBlock = getStandaloneCssBlock(".map-support-link");
    const tipBlock = getStandaloneCssBlock(".map-tip-button");

    expect(footerBlock).toContain("position: fixed");
    expect(footerBlock).toContain("left: 50%");
    expect(footerBlock).toContain("bottom: 6px");
    expect(footerBlock).toContain("transform: translateX(-50%)");
    expect(supportLinkBlock).toContain("font-size: 11px");
    expect(supportLinkBlock).toContain("opacity: 0.72");
    expect(tipBlock).toContain("font-size: 11px");
    expect(tipBlock).toContain("background: transparent");
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
    expect(block).toContain("transform: translate(-50%, -50%) rotate(-45deg)");
    expect(block).toContain("transform-origin: 50% 50%");
    expect(block).toContain("border-radius: 50% 50% 50% 0");
    expect(block).toContain("background: #facc15");
    expect(block).toContain("border: 2px solid #92400e");
    expect(block).not.toContain("transform-origin: 50% 100%");
    expect(block).not.toContain("calc(-100% + 2px)");
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

function getKeyframesBlock(name: string): string {
  const match = globalsCss.match(new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));

  if (!match || match[1] === undefined) {
    throw new Error(`Missing keyframes for ${name}`);
  }

  return match[1];
}

function getStandaloneCssBlock(selector: string): string {
  const blocks = getAllStandaloneCssBlocks(selector);

  if (blocks[0] !== undefined) {
    return blocks[0];
  }

  throw new Error(`Missing standalone CSS block for ${selector}`);
}

function getAllStandaloneCssBlocks(selector: string): string[] {
  const lines = globalsCss.split(/\r?\n/);
  const blocks: string[] = [];

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
        blocks.push(blockLines.join("\n"));
        break;
      }

      blockLines.push(lines[blockIndex]);
    }
  }

  return blocks;
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
