import { api } from "@/server/http";
import { automations } from "@/server/services";

export const GET = api(({ actor, query }) => automations.catalog(actor, { boardId: query.get("boardId") ?? undefined }));
