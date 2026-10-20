import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** POST: start a full sync of the schedule's scope now; returns the running job (poll /api/v1/admin/import/:id). */
export const POST = api<{ kind: string }>(({ actor, params }) => importConnections.runNow(actor, params.kind), { status: 202 });
