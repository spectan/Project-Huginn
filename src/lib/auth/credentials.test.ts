import { describe, expect, it } from "vitest";
import { parseAuthCredentials } from "./credentials";

describe("parseAuthCredentials", () => {
  it("accepts a trimmed username and a production-length password", () => {
    const result = parseAuthCredentials({
      password: "correct horse battery staple",
      username: " Mako_945 "
    });

    expect(result).toEqual({
      ok: true,
      value: {
        password: "correct horse battery staple",
        username: "Mako_945"
      }
    });
  });

  it("rejects malformed usernames", () => {
    const result = parseAuthCredentials({
      password: "correct horse battery staple",
      username: "!!"
    });

    expect(result).toEqual({
      ok: false,
      error: "Username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens"
    });
  });

  it("rejects short passwords", () => {
    const result = parseAuthCredentials({
      password: "short",
      username: "Mako"
    });

    expect(result).toEqual({
      ok: false,
      error: "Password must be 12-128 characters"
    });
  });
});
