import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("docker-compose.yml", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");
const envExample = readFileSync(".env.example", "utf8");

describe("environment configuration", () => {
  it("uses the shared huginn-app image for the app and sync services", () => {
    expect(compose).toContain("image: huginn-app:latest");
    expect(compose).not.toContain("mapsamuelzone");
    expect(compose).not.toContain("AUTH_SECRET");
  });

  it("does not provide runnable placeholder secrets in the example env file", () => {
    expect(envExample).toContain('POSTGRES_PASSWORD=""');
    expect(envExample).toContain('INITIAL_ADMIN_PASSWORD=""');
    expect(envExample).not.toContain("replace-before-use");
  });

  it("keeps local planning docs out of Docker build contexts", () => {
    expect(dockerignore).toContain("docs/");
    expect(dockerignore).toContain("design.md");
    expect(dockerignore).toContain("learnings.md");
  });
});
