import { api } from "@/server/http";
import { dashboards } from "@/server/services";

/** PUT { layout: [{ id, x, y, w, h }] } after a drag/resize. */
export const PUT = api<{ id: string }>(async ({ actor, params, body }) => dashboards.saveLayout(actor, params.id, (await body()).layout));
