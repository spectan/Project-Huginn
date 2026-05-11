import { describe, expect, it } from "vitest";
import {
  createClearedSessionCookieOptions,
  createSessionCookieOptions
} from "./cookies";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session";

describe("session cookie options", () => {
  it("creates a persistent root session cookie for shared links on the same host", () => {
    const expiresAt = new Date("2026-08-09T00:00:00.000Z");

    expect(createSessionCookieOptions("session-token", expiresAt)).toEqual({
      expires: expiresAt,
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 90,
      name: SESSION_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      secure: false,
      value: "session-token"
    });
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90);
  });

  it("clears the same root cookie on logout", () => {
    expect(createClearedSessionCookieOptions()).toEqual({
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      name: SESSION_COOKIE_NAME,
      path: "/",
      sameSite: "lax",
      secure: false,
      value: ""
    });
  });
});
