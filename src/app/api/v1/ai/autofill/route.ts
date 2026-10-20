/** Column menu "AI autofill". */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const POST = api(async ({ actor, body }) => ai.blocks.autofillColumn(actor, await body()));
