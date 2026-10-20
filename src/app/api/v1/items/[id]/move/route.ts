import { api } from "@/server/http";
import { items } from "@/server/services";

/** body: { groupId?, boardId?, beforeId?|afterId?|top?|position? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => items.move(actor, params.id, await body()));
