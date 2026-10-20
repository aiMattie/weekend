import { api, intParam } from "@/server/http";
import { automations } from "@/server/services";

export const GET = api<{ id: string }>(({ actor, params, query }) => automations.listRuns(actor, { automationId: params.id, limit: intParam(query, "limit") }));
