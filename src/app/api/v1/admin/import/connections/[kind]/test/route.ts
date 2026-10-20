import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** POST: check the credentials in use against monday.com (read-only). */
export const POST = api<{ kind: string }>(({ actor, params }) => importConnections.testConnection(actor, params.kind));
