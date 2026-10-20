import { api } from "@/server/http";
import { apiTokens } from "@/server/services";
import { usageForTokens } from "@/server/services/api-tokens";

/** Personal API tokens of the current user (admins: ?all=1 for the whole account). */
export const GET = api(({ actor, query }) => {
  const rows = apiTokens.list(actor, { all: query.get("all") === "1" });
  const usage = usageForTokens(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usedToday: usage[r.id]?.used ?? 0, callsToday: usage[r.id]?.calls ?? 0 }));
});

/** Create a token; the plaintext `token` is in this response only. */
export const POST = api(async ({ actor, body }) => {
  const { token, row } = apiTokens.create(actor, await body());
  return { token, ...row };
}, { status: 201 });
