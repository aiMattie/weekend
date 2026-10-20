import { api } from "@/server/http";
import { tags } from "@/server/services";

export const GET = api(({ actor, query }) => tags.list(actor, { q: query.get("q") ?? undefined }));
/** create_or_get_tag. body: { name, color? } */
export const POST = api(async ({ actor, body }) => tags.createOrGet(actor, await body()));
