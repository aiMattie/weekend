import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** PUT: verify + store credentials (monday: { apiKey }). DELETE: unlink. */
export const PUT = api<{ kind: string }>(async ({ actor, params, body }) => importConnections.connect(actor, params.kind, await body()));
export const DELETE = api<{ kind: string }>(({ actor, params }) => importConnections.disconnect(actor, params.kind));
