import type { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session";

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(createSessionCookieOptions(token, expiresAt));
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(createClearedSessionCookieOptions());
}

export function createSessionCookieOptions(token: string, expiresAt: Date): SessionCookieOptions {
  return {
    expires: expiresAt,
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: token
  };
}

export function createClearedSessionCookieOptions(): SessionCookieOptions {
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: ""
  };
}

type SessionCookieOptions = {
  expires: Date;
  httpOnly: true;
  maxAge: number;
  name: string;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
};
