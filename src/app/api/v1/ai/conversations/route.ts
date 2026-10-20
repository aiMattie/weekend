import { api } from "@/server/http";
import { ai } from "@/server/services";

export const GET = api(({ actor }) => ai.listConversations(actor));
