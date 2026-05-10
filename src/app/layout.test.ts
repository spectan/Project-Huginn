import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { metadata } from "./layout";

describe("root metadata", () => {
  it("uses Project Huginn browser and link metadata", () => {
    expect(metadata.title).toBe("Project Huginn");
    expect(metadata.description).toBe("Huginn - A shared Wurm Online mapping utility");
    expect(metadata.icons).toEqual({
      icon: [
        {
          sizes: "16x16",
          type: "image/x-icon",
          url: "/favicon.ico"
        },
        {
          sizes: "16x16",
          type: "image/png",
          url: "/logos/huginn-16-dark.png"
        }
      ]
    });
  });

  it("provides App Router icon metadata files for browser tabs", () => {
    const appDirectory = join(process.cwd(), "src", "app");

    expect(existsSync(join(appDirectory, "favicon.ico"))).toBe(true);
    expect(existsSync(join(appDirectory, "icon.png"))).toBe(true);
  });
});
