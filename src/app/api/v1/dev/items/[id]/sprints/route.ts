import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
/** Every sprint the task has been in, with what happened there (done, carried over, removed, current). */
export const GET = api<P>(({ actor, params }) => sprints.sprintHistory(actor, params.id));
