/** graphql-yoga instance + the HTTP handler used by /api/graphql (and the /api/v2 alias). */
import { createYoga, type Plugin } from "graphql-yoga";
import { GraphQLError, Kind } from "graphql";
import type { Actor } from "@/lib/actor";
import { getActor } from "@/lib/auth";
import { resolveBearer } from "@/lib/auth/bearer";
import { ApiLimitError, chargeCall, limits } from "@/server/platform/rate-limit";
import { recordCall } from "@/server/services/api-tokens";
import { recordAudit } from "@/server/services/audit";
import { isLocked } from "@/server/services/account-settings";
import { analyze } from "./complexity";
import { newContext, type GqlContext } from "./context";
import { toGraphQLError } from "./errors";
import { getSchema } from "./schema";

export const API_VERSION = "2025-10";

function operationLabel(args: { document: import("graphql").DocumentNode; operationName?: string | null }): string {
  const op = args.document.definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION && (!args.operationName || d.name?.value === args.operationName));
  if (op && op.kind === Kind.OPERATION_DEFINITION) {
    const first = op.selectionSet.selections.find((s) => s.kind === Kind.FIELD);
    return `${op.operation}:${op.name?.value ?? (first && first.kind === Kind.FIELD ? first.name.value : "anonymous")}`;
  }
  return "unknown";
}

const isIntrospection = (doc: import("graphql").DocumentNode) =>
  doc.definitions.every((d) => d.kind !== Kind.OPERATION_DEFINITION || d.selectionSet.selections.every((s) => s.kind === Kind.FIELD && s.name.value.startsWith("__")));

const limitsPlugin: Plugin<GqlContext> = {
  onExecute({ args, setResultAndStopExecution }) {
    const ctx = args.contextValue;
    const started = Date.now();
    try {
      const { cost, depth } = analyze(args.schema, args.document, args.operationName, (args.variableValues ?? {}) as Record<string, unknown>);
      if (depth > limits().maxDepth) throw new ApiLimitError(`Query depth ${depth} exceeds the maximum of ${limits().maxDepth}`, "ComplexityException", 400);
      ctx.report = ctx.holder.report = chargeCall(ctx.actor, cost);
    } catch (e) {
      const err = toGraphQLError(e);
      recordCall(ctx.actor, { channel: "graphql", name: operationLabel(args), ok: false, error: err.message, durationMs: Date.now() - started });
      setResultAndStopExecution({ errors: [err] });
      return;
    }
    return {
      onExecuteDone({ result }) {
        if (isIntrospection(args.document)) return;
        const errors = "errors" in result ? (result.errors as readonly GraphQLError[] | undefined) : undefined;
        const label = operationLabel(args);
        recordCall(ctx.actor, { channel: "graphql", name: label, ok: !errors?.length, error: errors?.[0]?.message, durationMs: Date.now() - started, detail: { cost: ctx.report?.query } });
        if (label.startsWith("mutation") && !errors?.length) recordAudit(ctx.actor, "graphql.call", { targetType: "graphql", targetName: label.slice(9), tokenId: ctx.actor.token?.id, cost: ctx.report?.query });
      },
    };
  },
};

let instance: ReturnType<typeof createYoga<{ gql: GqlContext }, GqlContext>> | null = null;

function getYoga() {
  instance ??= createYoga<{ gql: GqlContext }, GqlContext>({
    schema: getSchema(),
    graphqlEndpoint: "/api/graphql",
    landingPage: false,
    graphiql: false,
    cors: false,
    maskedErrors: true,
    context: ({ gql }) => gql,
    plugins: [limitsPlugin],
  });
  return instance;
}

/** `Authorization` may hold the raw token or `Bearer <token>`. */
export async function authenticateRequest(req: Request): Promise<{ actor: Actor | null; viaCookie: boolean }> {
  const h = req.headers.get("authorization")?.trim();
  if (h) {
    const token = h.replace(/^Bearer\s+/i, "").trim();
    const actor = token ? await resolveBearer(token) : null;
    // panic button: a locked account refuses every token
    return { actor: actor && !isLocked(actor.accountId) ? actor : null, viaCookie: false };
  }
  try {
    return { actor: { ...(await getActor(req)), source: "graphql" }, viaCookie: true };
  } catch {
    return { actor: null, viaCookie: true };
  }
}

const unauthorized = () => Response.json({ error_message: "Not Authenticated", error_code: "UserUnauthorizedException", status_code: 401, errors: [{ message: "Not Authenticated", extensions: { code: "UserUnauthorizedException", status_code: 401 } }] }, { status: 401 });

export async function handleGraphql(req: Request): Promise<Response> {
  const { actor, viaCookie } = await authenticateRequest(req);
  if (!actor) return unauthorized();
  // cookie-authenticated browsers: refuse form-style cross-site posts (CSRF); tokens are not ambient so need no check
  if (viaCookie && req.method === "POST" && !/application\/json/i.test(req.headers.get("content-type") ?? "")) {
    return Response.json({ errors: [{ message: "Content-Type must be application/json", extensions: { code: "InvalidArgumentException" } }] }, { status: 415 });
  }
  const gql = newContext({ ...actor, source: "graphql" });
  // /api/v2 alias -> canonical endpoint so yoga matches
  const url = new URL(req.url);
  const canonical = new Request(new URL("/api/graphql" + url.search, url.origin), req);
  const res = await getYoga().handleRequest(canonical, { gql });
  const headers = new Headers(res.headers);
  headers.delete("content-length"); // Next may compress the body: a stale length would truncate it
  headers.set("API-Version", req.headers.get("api-version") ?? API_VERSION);
  headers.set("X-Request-Id", gql.requestId);
  const rep = gql.holder.report;
  if (rep) {
    headers.set("X-Complexity-Query", String(rep.query));
    headers.set("X-Complexity-Remaining", String(Math.max(0, rep.after)));
    headers.set("X-Daily-Budget-Remaining", String(Math.max(0, rep.dailyRemaining)));
    headers.set("X-RateLimit-Reset", String(rep.reset_in_x_seconds));
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
