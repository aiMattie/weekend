import { z } from "zod";
import { api } from "@/server/http";
import { inbox } from "@/server/services";
import { parse } from "@/server/services/_shared";

type P = { id: string };
const patch = z.object({ read: z.boolean().optional(), bookmarked: z.boolean().optional() });

/** body: { read?: boolean, bookmarked?: boolean } */
export const PATCH = api<P>(async ({ actor, params, body }) => {
  const d = parse(patch, await body());
  let out = null;
  if (d.read !== undefined) out = inbox.markRead(actor, params.id, d.read);
  if (d.bookmarked !== undefined) out = inbox.bookmark(actor, params.id, d.bookmarked);
  return out ?? inbox.markRead(actor, params.id, true);
});
export const DELETE = api<P>(({ actor, params }) => inbox.remove(actor, params.id));
