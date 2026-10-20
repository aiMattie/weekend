import { api } from "@/server/http";
import * as activity from "@/server/services/activity";

/** ?columnId=&userId=&event=&limit= */
export const GET = api<{ id: string }>(({ actor, params, query }) => activity.listForItem(actor, params.id, Object.fromEntries(query)));
