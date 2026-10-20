import { api } from "@/server/http";
import { ai } from "@/server/services";

/** Plan only (no creation): Claude first (ai module), the pattern parser as fallback. */
export const POST = api(async ({ actor, body }) => ai.nl.planFromText(actor, await body()));
