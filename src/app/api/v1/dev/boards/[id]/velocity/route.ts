import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params, query }) => sprints.velocity(actor, params.id, { klant: query.get("klant") || null, unit: query.get("unit") === "count" ? "count" : "estimate" }));
