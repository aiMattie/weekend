import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string; knowledgeId: string };
export const DELETE = api<P>(({ actor, params }) => agents.removeKnowledge(actor, params.id, params.knowledgeId));
