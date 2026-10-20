import { freshCtx, type Ctx } from "../helpers";
import { handleGraphql } from "../../src/server/graphql/server";
import * as apiTokens from "../../src/server/services/api-tokens";
import { resetRateLimits } from "../../src/server/platform/rate-limit";
import type { Actor } from "../../src/lib/actor";

export interface PCtx extends Ctx {
  token: string;
  gql: <T = any>(query: string, variables?: Record<string, unknown>, opts?: { token?: string; raw?: boolean }) => Promise<{ data?: T; errors?: any[]; status: number; headers: Headers }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  mkToken: (actor: Actor, input?: Record<string, unknown>) => string;
}

export async function platformCtx(): Promise<PCtx> {
  const c = await freshCtx();
  resetRateLimits();
  const mkToken = (actor: Actor, input: Record<string, unknown> = {}) => apiTokens.create(actor, { name: "test", ...input }).token;
  const token = mkToken(c.admin);
  const gql: PCtx["gql"] = async (query, variables, opts) => {
    const res = await handleGraphql(new Request("http://localhost/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: opts?.token ?? token },
      body: JSON.stringify({ query, variables }),
    }));
    const body = await res.json();
    return { ...body, status: res.status, headers: res.headers };
  };
  return { ...c, token, gql, mkToken };
}
