import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

export const GET = api(({ actor }) => permissionsAdmin.listRoles(actor));
export const POST = api(async ({ actor, body }) => permissionsAdmin.createRole(actor, await body()), { status: 201 });
