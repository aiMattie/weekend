import { api } from "@/server/http";
import { groups } from "@/server/services";

/** body: { beforeId? | afterId? | top? | position? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => groups.move(actor, params.id, await body()));
