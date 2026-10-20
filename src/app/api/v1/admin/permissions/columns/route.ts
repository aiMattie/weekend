import { api } from "@/server/http";
import { permissionsAdmin } from "@/server/services";

/** ?board=<id> -> who can view / edit each column of the board */
export const GET = api(({ actor, query }) => permissionsAdmin.listColumnPermissions(actor, query.get("board") ?? ""));
