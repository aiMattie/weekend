import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const POST = api<P>(async ({ actor, params, body }) => sprints.completeSprint(actor, params.id, await body()));
