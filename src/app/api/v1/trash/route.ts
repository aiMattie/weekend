import { api } from "@/server/http";
import * as trash from "@/server/services/trash";

/** ?state=archived|deleted */
export const GET = api(({ actor, query }) => trash.list(actor, { state: query.get("state") ?? "deleted" }));
