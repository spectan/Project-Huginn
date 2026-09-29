export type JsonRequestResult<T> = { ok: true; body: T } | { ok: false; error: string };

/** Returns the `error` string from a JSON error response body, if there is one. */
export async function readResponseError(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof body?.error === "string" && body.error.length > 0 ? body.error : null;
}

/**
 * Fetches JSON, turning non-2xx responses and network failures into an error
 * message: the server's `error` field when present, otherwise `fallbackError`.
 */
export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string
): Promise<JsonRequestResult<T>> {
  try {
    const response = await fetch(url, init);

    if (!response.ok) {
      return { ok: false, error: (await readResponseError(response)) ?? fallbackError };
    }

    return { ok: true, body: (await response.json().catch(() => null)) as T };
  } catch {
    return { ok: false, error: fallbackError };
  }
}
