import { describe, expect, it } from "vitest";

import {
  extractDeedNameFromDisbandMessage,
  extractDeedRenameFromMessage
} from "./event-feed-messages.mjs";

describe("event feed messages", () => {
  it("extracts the old and new names from a deed rename", () => {
    expect(extractDeedRenameFromMessage("Village Moonbright changed name to Starling")).toEqual({
      newName: "Starling",
      oldName: "Moonbright"
    });
  });

  it("handles multi-word names and a trailing period", () => {
    expect(extractDeedRenameFromMessage("Village Old Harbor changed name to New Harbor Town.")).toEqual({
      newName: "New Harbor Town",
      oldName: "Old Harbor"
    });
  });

  it("ignores messages that are not deed renames", () => {
    expect(extractDeedRenameFromMessage("The settlement of Moonbright has just been disbanded")).toBeNull();
    expect(extractDeedRenameFromMessage("Village Moonbright changed name to Moonbright")).toBeNull();
    expect(extractDeedRenameFromMessage("A new Rift has been reported!")).toBeNull();
  });

  it("extracts the deed name from a disband", () => {
    expect(extractDeedNameFromDisbandMessage("The settlement of Moonbright has just been disbanded by Sam.")).toBe("Moonbright");
    expect(extractDeedNameFromDisbandMessage("Village Moonbright changed name to Starling")).toBeNull();
  });
});
