import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => permissionsAdmin.getWorkspace(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => permissionsAdmin.setWorkspace(actor, params.id, await body()));
