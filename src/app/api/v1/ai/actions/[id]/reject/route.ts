import { api } from "@/server/http";
import { ai } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => ai.rejectAction(actor, params.id));
