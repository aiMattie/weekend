import { api } from "@/server/http";
import { dashboards } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => dashboards.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => dashboards.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => dashboards.remove(actor, params.id));
