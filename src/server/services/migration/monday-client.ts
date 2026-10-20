/**
 * Read-only GraphQL client for api.monday.com.
 *
 * HARD SAFETY RULE: the importer never mutates the real monday account. `assertReadOnly()`
 * rejects every GraphQL document that contains the word `mutation` (anywhere, after stripping
 * comments), and `MondayClient` only ever sends documents that passed it. There is no code path
 * that bypasses it. The API key is only sent to the monday host (or a localhost mock in tests).
 */
export class ReadOnlyViolationError extends Error {
  constructor(message = "monday importer is read-only: GraphQL document contains a mutation") {
    super(message);
    this.name = "ReadOnlyViolationError";
  }
}

/** Throws when `doc` could write to monday. Conservative: a string literal containing "mutation" also trips it. */
export function assertReadOnly(doc: string): void {
  if (typeof doc !== "string" || !doc.trim()) throw new ReadOnlyViolationError("Empty GraphQL document");
  const stripped = doc.replace(/#[^\n\r]*/g, " ");
  if (/\bmutation\b/i.test(stripped)) throw new ReadOnlyViolationError();
  if (/\bsubscription\b/i.test(stripped)) throw new ReadOnlyViolationError("monday importer only runs queries");
  // anything that is not a query/fragment definition at the top is refused
  if (!/^\s*(query\b|\{|fragment\b)/i.test(stripped)) throw new ReadOnlyViolationError("monday importer only runs queries");
}

export const MONDAY_API_VERSION = "2025-10";
export const MONDAY_DEFAULT_URL = "https://api.monday.com/v2";

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface MondayClientOptions {
  apiKey: string;
  apiUrl?: string;
  version?: string;
  fetch?: FetchLike;
  /** injectable for tests */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  log?: (msg: string) => void;
}

export class MondayApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "MondayApiError";
  }
}

const isMondayHost = (host: string) => host === "monday.com" || host.endsWith(".monday.com");
const isLocalHost = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

export class MondayClient {
  readonly apiUrl: string;
  readonly version: string;
  private fetchFn: FetchLike;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;
  private apiKey: string;
  private log: (msg: string) => void;
  /** number of GraphQL requests performed (for the report) */
  requests = 0;

  constructor(opts: MondayClientOptions) {
    this.apiUrl = opts.apiUrl ?? MONDAY_DEFAULT_URL;
    const host = new URL(this.apiUrl).hostname;
    if (!isMondayHost(host) && !isLocalHost(host)) throw new Error(`Refusing to send the monday API key to ${host}`);
    this.apiKey = opts.apiKey;
    this.version = opts.version ?? MONDAY_API_VERSION;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 6;
    this.log = opts.log ?? (() => {});
  }

  /** Run a read-only query with retry/backoff on rate limits and complexity budget errors. */
  async query<T = Record<string, unknown>>(doc: string, variables: Record<string, unknown> = {}): Promise<T> {
    assertReadOnly(doc);
    let attempt = 0;
    for (;;) {
      attempt++;
      this.requests++;
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await this.fetchFn(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: this.apiKey, "API-Version": this.version },
          body: JSON.stringify({ query: doc, variables }),
        });
      } catch (e) {
        if (attempt > this.maxRetries) throw new MondayApiError(`Network error: ${(e as Error).message}`);
        await this.sleep(backoff(attempt));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt > this.maxRetries) throw new MondayApiError(`HTTP ${res.status}`, res.status);
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt);
        this.log(`monday: HTTP ${res.status}, waiting ${Math.round(wait / 1000)}s`);
        await this.sleep(wait);
        continue;
      }
      const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string; retry_in_seconds?: number } }[]; error_message?: string; error_code?: string };
      if (body.errors?.length || body.error_message) {
        const e = body.errors?.[0];
        const code = e?.extensions?.code ?? body.error_code;
        const retryable = code && /RATE_LIMIT|COMPLEXITY|IP_RATE|CONCURRENCY/i.test(code);
        if (retryable && attempt <= this.maxRetries) {
          const wait = (e?.extensions?.retry_in_seconds ?? 0) * 1000 || backoff(attempt, 2000);
          this.log(`monday: ${code}, waiting ${Math.round(wait / 1000)}s`);
          await this.sleep(wait);
          continue;
        }
        throw new MondayApiError(e?.message ?? body.error_message ?? "GraphQL error", res.status, code);
      }
      return body.data as T;
    }
  }

  /** GET a file (read-only). The key is only attached for monday hosts. */
  async download(url: string): Promise<Uint8Array> {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    if (isMondayHost(u.hostname) || isLocalHost(u.hostname)) headers.Authorization = this.apiKey;
    const res = await this.fetchFn(url, { method: "GET", headers });
    if (!res.ok) throw new MondayApiError(`Download failed: HTTP ${res.status}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
}

const backoff = (attempt: number, base = 1000) => Math.min(60_000, base * 2 ** (attempt - 1));
