/** Weekend magic step 1: outline of the board (nothing is created). */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const POST = api(async ({ actor, body }) => ai.magic.preview(actor, await body()));
