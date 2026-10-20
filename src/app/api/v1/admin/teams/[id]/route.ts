import { api } from "@/server/http";
import { teams } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => teams.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => teams.rename(actor, params.id, String((await body()).name ?? "")));
export const DELETE = api<P>(({ actor, params }) => { teams.remove(actor, params.id); });
