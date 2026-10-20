import { api } from "@/server/http";
import * as views from "@/server/services/views";

/** body: { shared: boolean } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => views.setShared(actor, params.id, (await body()).shared === true));
