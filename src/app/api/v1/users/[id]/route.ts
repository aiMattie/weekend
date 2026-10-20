import { api } from "@/server/http";
import { users } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => users.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => users.update(actor, params.id, await body()));
