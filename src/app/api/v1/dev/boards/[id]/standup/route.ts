import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params, query }) => sprints.standup(actor, params.id, { date: query.get("date") ?? undefined }));
