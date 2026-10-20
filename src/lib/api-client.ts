/** Browser-side fetch helper for /api/v1. Throws ApiError with the server's error code/message. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path.startsWith("/") ? path : `/api/v1/${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- api-client is router independent
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error?.message ?? res.statusText, res.status, json?.error?.code ?? "error");
  return json as T;
}

/** Shorthand: `api.post("/api/v1/items", {...})`. Paths are absolute (start with /api/v1/...). */
export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body: unknown = {}) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T = unknown>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  put: <T = unknown>(path: string, body: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
