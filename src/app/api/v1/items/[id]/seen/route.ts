import { api } from "@/server/http";
import * as updates from "@/server/services/updates";

/** mark all updates of the item as seen by me -> { marked } */
export const POST = api<{ id: string }>(({ actor, params }) => ({ marked: updates.markSeen(actor, params.id) }));
