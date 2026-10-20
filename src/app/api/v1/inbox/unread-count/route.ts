import { api } from "@/server/http";
import { inbox } from "@/server/services";

export const GET = api(({ actor }) => ({ unread: inbox.unreadCount(actor) }));
