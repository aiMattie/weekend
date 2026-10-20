/** Confirm step: create tasks / subitems from action items. */
import { api } from "@/server/http";
import { notetaker } from "@/server/services";

type P = { id: string };
export const POST = api<P>(async ({ actor, params, body }) => notetaker.createTasks(actor, params.id, await body()), { status: 201 });
