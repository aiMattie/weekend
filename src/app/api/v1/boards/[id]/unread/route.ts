import { api } from "@/server/http";
import * as updates from "@/server/services/updates";

/** { [itemId]: unreadUpdateCount } for the current user */
export const GET = api<{ id: string }>(({ actor, params }) => updates.unreadCounts(actor, params.id));
