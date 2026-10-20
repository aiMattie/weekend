/**
 * Thin HTTP helpers for route handlers. Every REST route is:
 *
 *   export const GET = api(({ actor, params, query }) => items.get(actor, params.id));
 *
 * `api()` authenticates (Bearer token or session cookie), parses the JSON body lazily,
 * and maps ServiceError -> JSON `{ error: { code, message, details } }` with the right status.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Actor } from "@/lib/actor";
import { getActor } from "@/lib/auth";
import { ServiceError, ValidationError } from "@/lib/errors";

export interface ApiCtx<P extends Record<string, string>> {
  req: NextRequest;
  actor: Actor;
  params: P;
  query: URLSearchParams;
  /** parsed JSON body (throws ValidationError on malformed JSON); `{}` when empty */
  body: () => Promise<Record<string, unknown>>;
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "internal", message: "Internal server error" } }, { status: 500 });
}

export function api<P extends Record<string, string> = Record<string, never>>(
  fn: (ctx: ApiCtx<P>) => unknown | Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: NextRequest, route: { params: Promise<P> }): Promise<Response> => {
    try {
      const actor = await getActor(req);
      const params = ((await route?.params) ?? {}) as P;
      const body = async () => {
        const text = await req.text();
        if (!text.trim()) return {};
        try {
          const parsed = JSON.parse(text);
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
          return parsed as Record<string, unknown>;
        } catch {
          throw new ValidationError("Request body must be a JSON object");
        }
      };
      const result = await fn({ req, actor, params, query: req.nextUrl.searchParams, body });
      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result, { status: opts.status ?? 200 });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const intParam = (sp: URLSearchParams, name: string): number | undefined => {
  const v = sp.get(name);
  return v === null || v === "" ? undefined : Number(v);
};
export const boolParam = (sp: URLSearchParams, name: string): boolean | undefined => {
  const v = sp.get(name);
  return v === null ? undefined : v === "true" || v === "1";
};
