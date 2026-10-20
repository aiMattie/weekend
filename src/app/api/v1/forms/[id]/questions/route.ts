import { z } from "zod";
import { api } from "@/server/http";
import { forms } from "@/server/services";
import { parse } from "@/server/services/_shared";

type P = { id: string };
/** GET = board columns that can still be added as a question. */
export const GET = api<P>(({ actor, params }) => forms.availableColumns(actor, params.id));
/** POST = add one question, or `{ ops: [...] }` for the batch editor. */
export const POST = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  if (Array.isArray(b.ops)) return forms.questionsEditor(actor, params.id, b.ops);
  return forms.addQuestion(actor, params.id, b);
}, { status: 201 });
/** PUT = reorder: `{ questionIds: [...] }`. */
export const PUT = api<P>(async ({ actor, params, body }) =>
  forms.reorderQuestions(actor, params.id, parse(z.object({ questionIds: z.array(z.string()).max(500) }), await body()).questionIds));
