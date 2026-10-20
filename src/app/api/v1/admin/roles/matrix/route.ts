import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";
import { CAPABILITIES } from "@/lib/permissions";

export const GET = api(() => ({ capabilities: CAPABILITIES, builtin: permissionsAdmin.builtinMatrix() }));
