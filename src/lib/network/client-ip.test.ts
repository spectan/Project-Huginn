import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "./client-ip";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/test", { headers });
}

describe("getClientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to one trusted hop and takes the rightmost X-Forwarded-For entry", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");

    expect(getClientIp(requestWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignores client-supplied entries left of the trusted proxies", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");

    expect(getClientIp(requestWith({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2"
    }))).toBe("203.0.113.7");
  });

  it("treats a chain shorter than the configured hops as untrusted", () => {
    expect(getClientIp(requestWith({ "x-forwarded-for": "203.0.113.7" }), 3)).toBeUndefined();
    expect(getClientIp(requestWith({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
      "x-real-ip": "198.51.100.4"
    }), 3)).toBe("198.51.100.4");
  });

  it("ignores forwarding headers entirely when TRUSTED_PROXY_HOPS is 0", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");

    expect(getClientIp(requestWith({
      "x-forwarded-for": "6.6.6.6",
      "x-real-ip": "7.7.7.7"
    }))).toBeUndefined();
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent or empty", () => {
    expect(getClientIp(requestWith({ "x-forwarded-for": " , ", "x-real-ip": " 198.51.100.4 " }), 1)).toBe("198.51.100.4");
    expect(getClientIp(requestWith({ "x-real-ip": "198.51.100.4" }), 1)).toBe("198.51.100.4");
  });

  it("returns undefined without proxy headers", () => {
    expect(getClientIp(requestWith({}), 1)).toBeUndefined();
  });

  it("falls back to the default for invalid configuration", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "-3");

    expect(getClientIp(requestWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
  });
});
