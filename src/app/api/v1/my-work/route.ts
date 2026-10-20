import { api, boolParam } from "@/server/http";
import { myWork } from "@/server/services";

export const GET = api(({ actor, query }) => {
  const csv = (k: string) => query.get(k)?.split(",").map((s) => s.trim()).filter(Boolean);
  return myWork.list(actor, {
    showDone: boolParam(query, "showDone"),
    includeTeams: boolParam(query, "includeTeams"),
    boardIds: csv("boardIds"),
    statusFilter: csv("status"),
    search: query.get("search") ?? undefined,
  });
});
