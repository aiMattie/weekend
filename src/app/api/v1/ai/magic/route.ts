/** Weekend magic step 2: build the (edited) outline through the services. */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const POST = api(async ({ actor, body }) => ai.magic.create(actor, await body()), { status: 201 });
