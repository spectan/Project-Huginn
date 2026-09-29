/** Builds a JSON `Request` for route-handler tests; `body` is omitted when undefined. */
export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method
  });
}
