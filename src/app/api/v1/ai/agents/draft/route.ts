import { api } from "@/server/http";
import { ai } from "@/server/services";

/** Draft an agent (name, instructions, skill) from a description. Creates nothing. */
export const POST = api(async ({ actor, body }) => ai.draftAgent(actor, await body()));
