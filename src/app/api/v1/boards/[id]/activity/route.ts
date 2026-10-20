import { api, intParam } from "@/server/http";
import { activity } from "@/server/services";

export const GET = api<{ id: string }>(({ actor, params, query }) => activity.activityForBoard(actor, params.id, intParam(query, "limit")));
