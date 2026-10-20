import { api } from "@/server/http";
import { columnActions } from "@/server/services";

/** Column actions: { action: "click" } (button), start | stop | add | remove | reset (time tracking), open_doc | new_doc (doc). */
export const POST = api<{ id: string; columnId: string }>(async ({ actor, params, body }) => columnActions.run(actor, params.id, params.columnId, await body()) ?? { ok: true });
