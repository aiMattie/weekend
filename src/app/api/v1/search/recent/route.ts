import { api } from "@/server/http";
import { search } from "@/server/services";

export const GET = api(({ actor }) => search.recent(actor));
export const POST = api(async ({ actor, body }) => { search.addRecent(actor, String((await body()).q ?? "")); });
export const DELETE = api(({ actor }) => { search.clearRecent(actor); });
