import { z } from "zod";
import { parse } from "@/server/services/_shared";
import { api } from "@/server/http";
import * as itemOps from "@/server/services/item-ops";

/** body: { to: "subitem", parentItemId } | { to: "item", groupId? } */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => {
  const b = parse(z.discriminatedUnion("to", [z.object({ to: z.literal("subitem"), parentItemId: z.string() }), z.object({ to: z.literal("item"), groupId: z.string().optional() })]), await body());
  return b.to === "subitem" ? itemOps.convertToSubitem(actor, params.id, b.parentItemId) : itemOps.convertToItem(actor, params.id, { groupId: b.groupId });
});
