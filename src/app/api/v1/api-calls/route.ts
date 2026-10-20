import { api, intParam } from "@/server/http";
import { apiTokens } from "@/server/services";

/** Recent API/MCP calls of the current user (admins: ?all=1). Filter with ?channel=mcp|graphql. */
export const GET = api(({ actor, query }) =>
  apiTokens.listCalls(actor, { limit: intParam(query, "limit") ?? 50, channel: query.get("channel") ?? undefined, all: query.get("all") === "1" }));
