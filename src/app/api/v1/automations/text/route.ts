import { api } from "@/server/http";
import { ai } from "@/server/services";

/** Natural language -> automation: Claude first (ai module), the pattern parser as fallback. */
export const POST = api(async ({ actor, body }) => ai.nl.createFromText(actor, await body()), { status: 201 });
