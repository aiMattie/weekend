import { api } from "@/server/http";
import { updates } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => ({ liked: updates.toggleLike(actor, params.id) }));
