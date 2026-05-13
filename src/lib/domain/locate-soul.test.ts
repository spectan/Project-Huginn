import { describe, expect, it } from "vitest";
import {
  getLocateSoulDistanceBand,
  getLocateSoulOverlayGeometry,
  locateSoulOverlayIntersectsMap,
  parseLocateSoulMessage
} from "./locate-soul";

describe("locate soul domain", () => {
  it("uses the Wurmpedia distance bands for modern locate soul casts", () => {
    expect(getLocateSoulDistanceBand("0")).toEqual({
      key: "0",
      label: "0 tiles",
      maxTiles: 0,
      minTiles: 0
    });
    expect(getLocateSoulDistanceBand("50-199")).toEqual({
      key: "50-199",
      label: "50-199 tiles",
      maxTiles: 199,
      minTiles: 50
    });
    expect(getLocateSoulDistanceBand("2000+")).toEqual({
      key: "2000+",
      label: "2000+ tiles",
      maxTiles: null,
      minTiles: 2000
    });
  });

  it("converts caster facing and relative direction into an absolute overlay sector", () => {
    expect(getLocateSoulOverlayGeometry({
      casterFacing: "north",
      direction: "aheadLeft",
      distanceBand: "20-49",
      mapHeightPx: 2048,
      mapWidthPx: 2048
    })).toEqual({
      centerAngleDegrees: 315,
      maxDistanceTiles: 49,
      minDistanceTiles: 20,
      spanDegrees: 45
    });

    expect(getLocateSoulOverlayGeometry({
      casterFacing: "east",
      direction: "right",
      distanceBand: "1000+",
      mapHeightPx: 2048,
      mapWidthPx: 2048
    })).toEqual({
      centerAngleDegrees: 180,
      maxDistanceTiles: 1999,
      minDistanceTiles: 1000,
      spanDegrees: 45
    });
  });

  it("uses the map diagonal as the outer range for the open-ended 2000+ band", () => {
    expect(getLocateSoulOverlayGeometry({
      casterFacing: "south",
      direction: "behind",
      distanceBand: "2000+",
      mapHeightPx: 2048,
      mapWidthPx: 2048
    })).toEqual({
      centerAngleDegrees: 0,
      maxDistanceTiles: 2897,
      minDistanceTiles: 2000,
      spanDegrees: 45
    });
  });

  it("detects when a locate soul overlay has visible tiles on the current map", () => {
    expect(locateSoulOverlayIntersectsMap({
      casterFacing: "north",
      direction: "aheadLeft",
      distanceBand: "50-199",
      mapHeightPx: 2048,
      mapWidthPx: 2048,
      x: 930,
      y: 1030
    })).toBe(true);
  });

  it("detects when a locate soul result points beyond every tile on the current map", () => {
    expect(locateSoulOverlayIntersectsMap({
      casterFacing: "north",
      direction: "behindRight",
      distanceBand: "2000+",
      mapHeightPx: 2048,
      mapWidthPx: 2048,
      x: 1092,
      y: 703
    })).toBe(false);
  });

  it("parses pasted locate soul output into target, direction, and distance", () => {
    expect(parseLocateSoulMessage(`[01:31:23] You cast Locate Soul.
[01:31:24] No such soul found.
[01:31:24] Corpse of Itsumo is very far away behind you to the right. `)).toEqual({
      direction: "behindRight",
      distanceBand: "2000+",
      targetName: "Itsumo"
    });
  });

  it("parses current locate soul distance phrases and front-left directions", () => {
    expect(parseLocateSoulMessage(
      "[20:40:29] The corpse of Funkiey is quite some distance away ahead of you to the left."
    )).toEqual({
      direction: "aheadLeft",
      distanceBand: "50-199",
      targetName: "Funkiey"
    });
  });

  it("returns null when pasted output does not include a successful locate result", () => {
    expect(parseLocateSoulMessage(`[01:31:23] You cast Locate Soul.
[01:31:24] No such soul found.`)).toBeNull();
  });
});
