import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => sprints.getSprint(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => sprints.updateSprint(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => sprints.deleteSprint(actor, params.id));
