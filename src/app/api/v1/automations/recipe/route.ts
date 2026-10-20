import { api } from "@/server/http";
import { automations } from "@/server/services";

export const POST = api(async ({ actor, body }) => automations.createFromRecipe(actor, await body()), { status: 201 });
