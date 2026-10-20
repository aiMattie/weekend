import { api } from "@/server/http";
import { epics } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => epics.roadmap(actor, params.id));
