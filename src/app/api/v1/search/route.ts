import { api } from "@/server/http";
import { search } from "@/server/services";

/** ?q=text&kinds=board,item&limit=8 -> { query, groups: [{ kind, hits, more }], total } (permission filtered) */
export const GET = api(({ actor, query }) => search.search(actor, { q: query.get("q") ?? "", kinds: query.get("kinds")?.split(",").filter(Boolean), limit: query.get("limit") ?? undefined }));
