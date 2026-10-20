import { api } from "@/server/http";
import { wispr } from "@/server/services";

type P = { id: string };
export const POST = api<P>(async ({ actor, params, body }) => wispr.save(actor, params.id, await body()));
