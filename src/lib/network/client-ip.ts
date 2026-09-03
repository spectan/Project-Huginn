export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(",")[0];
    if (first !== undefined) {
      return first.trim();
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp !== null && realIp.length > 0) {
    return realIp;
  }

  return undefined;
}
