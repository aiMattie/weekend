import { api } from "@/server/http";
import { ai } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => ai.getConversation(actor, params.id));
export const DELETE = api<P>(({ actor, params }) => ai.deleteConversation(actor, params.id));
