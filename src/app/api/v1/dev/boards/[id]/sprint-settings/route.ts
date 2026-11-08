import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => sprints.sprintSettings(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => sprints.updateSprintSettings(actor, params.id, await body()));
