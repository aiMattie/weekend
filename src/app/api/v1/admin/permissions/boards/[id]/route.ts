import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => permissionsAdmin.getBoard(actor, params.id));
/** body: { level?, visibility? } */
export const PATCH = api<P>(async ({ actor, params, body }) => permissionsAdmin.setBoard(actor, params.id, await body()));
