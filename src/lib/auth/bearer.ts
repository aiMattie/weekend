/**
 * API-token (Bearer) hook. The `platform` agent registers a resolver that looks the token up in
 * the `api_tokens` table and returns an Actor. Until then Bearer auth is simply unavailable.
 *
 *   import { setBearerResolver } from "@/lib/auth/bearer";
 *   setBearerResolver(async (token) => { ...lookup...; return actor | null });
 *
 * Call setBearerResolver from a module that is imported by src/lib/auth/index.ts
 * (see `src/lib/auth/bearer-resolvers.ts`, add one import line there).
 */
import type { Actor } from "../actor";

export type BearerResolver = (token: string) => Promise<Actor | null> | Actor | null;

const g = globalThis as unknown as { __bearerResolvers?: BearerResolver[] };
const resolvers = (g.__bearerResolvers ??= []);

export function setBearerResolver(fn: BearerResolver): void {
  resolvers.push(fn);
}

export function extractBearer(headers: Headers): string | null {
  const h = headers.get("authorization");
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function resolveBearer(token: string): Promise<Actor | null> {
  for (const r of resolvers) {
    const actor = await r(token);
    if (actor) return { ...actor, source: actor.source ?? "api" };
  }
  return null;
}
