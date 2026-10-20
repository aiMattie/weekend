import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

type P = { id: string };
/** body: { edit?: { mode, userIds, teamIds }, view?: { mode, userIds, teamIds } } */
export const PUT = api<P>(async ({ actor, params, body }) => permissionsAdmin.setColumnPermission(actor, params.id, await body()));
