import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

type P = { id: string };
export const PATCH = api<P>(async ({ actor, params, body }) => permissionsAdmin.updateRole(actor, params.id, await body()));
export const DELETE = api<P>(({ actor, params }) => { permissionsAdmin.deleteRole(actor, params.id); });
