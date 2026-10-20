import { api } from "@/server/http";
import { inbox } from "@/server/services";

export const POST = api(({ actor }) => ({ updated: inbox.markAllRead(actor) }));
