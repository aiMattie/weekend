/** Manual / test run (waits for the run to finish). */
import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string };
export const POST = api<P>(async ({ actor, params, body }) => agents.run(actor, params.id, await body()));
