const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Resolves the client IP from proxy headers.
 *
 * Each proxy appends the address it received the request from to the right of
 * X-Forwarded-For, so everything left of the entries added by our own proxies is
 * client-controlled. With TRUSTED_PROXY_HOPS=N we take the Nth entry from the
 * right (the one appended by the outermost trusted proxy). A chain shorter than
 * N did not pass through all of our proxies, so it is treated as untrusted and
 * only X-Real-IP is consulted. With N=0 the app is reached directly and
 * forwarding headers are ignored entirely.
 */
export function getClientIp(
  request: Request,
  trustedProxyHops = readTrustedProxyHops()
): string | undefined {
  if (trustedProxyHops === 0) {
    return undefined;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length >= trustedProxyHops) {
      return entries[entries.length - trustedProxyHops];
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp !== undefined && realIp.length > 0) {
    return realIp;
  }

  return undefined;
}

function readTrustedProxyHops(): number {
  const configured = process.env.TRUSTED_PROXY_HOPS;

  if (configured === undefined || configured.trim().length === 0) {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }

  const parsed = Number(configured);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_TRUSTED_PROXY_HOPS;
}
