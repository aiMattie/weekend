import { api } from "@/server/http";
import { sprints } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => sprints.planning(actor, params.id));
