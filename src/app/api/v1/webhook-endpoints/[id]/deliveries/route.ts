import { api, intParam } from "@/server/http";
import { webhooks } from "@/server/services";

export const GET = api<{ id: string }>(({ actor, params, query }) => webhooks.listDeliveries(actor, params.id, { limit: intParam(query, "limit") }));
