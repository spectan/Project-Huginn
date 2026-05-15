import { describe, expect, it } from "vitest";

import { validateInitialAdminPassword } from "./seed-admin-config.mjs";

describe("seed admin config", () => {
  it("rejects known placeholder admin passwords", () => {
    expect(validateInitialAdminPassword("replace-before-use")).toEqual({
      error: "INITIAL_ADMIN_PASSWORD must be changed from the example placeholder",
      ok: false
    });
  });

  it("accepts a non-placeholder admin password with the required length", () => {
    expect(validateInitialAdminPassword("correct horse battery staple")).toEqual({
      ok: true,
      value: "correct horse battery staple"
    });
  });
});
