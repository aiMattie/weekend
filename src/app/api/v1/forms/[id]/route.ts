import { api } from "@/server/http";
import { forms } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => forms.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => forms.update(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => forms.remove(actor, params.id));
