import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => sprints.startSprint(actor, params.id));
