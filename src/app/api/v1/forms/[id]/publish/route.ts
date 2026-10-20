import { z } from "zod";
import { api } from "@/server/http";
import { forms } from "@/server/services";
import { parse } from "@/server/services/_shared";

export const POST = api<{ id: string }>(async ({ actor, params, body }) =>
  forms.setPublished(actor, params.id, parse(z.object({ published: z.boolean() }), await body()).published));
