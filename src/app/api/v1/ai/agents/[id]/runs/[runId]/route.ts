import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string; runId: string };
export const GET = api<P>(({ actor, params }) => agents.getRun(actor, params.runId));
