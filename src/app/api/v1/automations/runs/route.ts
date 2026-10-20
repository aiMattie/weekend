import { api, intParam } from "@/server/http";
import { automations } from "@/server/services";
import type { RunStatus } from "@/db/schema/automations";

export const GET = api(({ actor, query }) => automations.listRuns(actor, { boardId: query.get("boardId") ?? undefined, status: (query.get("status") as RunStatus | null) ?? undefined, limit: intParam(query, "limit") }));
