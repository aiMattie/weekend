import { NotFoundError } from "@/lib/errors";
import { api } from "@/server/http";
import { columns, permissionsAdmin } from "@/server/services";

type P = { id: string };
/** Column permissions row ({ edit, view } access objects, see services/permissions.ts). */
export const GET = api<P>(({ actor, params }) => {
  const col = columns.get(actor, params.id);
  const row = permissionsAdmin.listColumnPermissions(actor, col.boardId).find((r) => r.columnId === col.id);
  if (!row) throw new NotFoundError("Column");
  return row;
});
export const PUT = api<P>(async ({ actor, params, body }) => permissionsAdmin.setColumnPermission(actor, params.id, await body()));
