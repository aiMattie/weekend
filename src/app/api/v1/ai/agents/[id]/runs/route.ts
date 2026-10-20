import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params, query }) => agents.listRuns(actor, params.id, { limit: Number(query.get("limit") ?? 30) }));
