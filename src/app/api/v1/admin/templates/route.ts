import { api } from "@/server/http";
import { templates } from "@/server/services";

/** POST { action: "all" } builds Delivery + Development + klant template; { action: "client", klantnaam } creates a klant workspace. */
export const POST = api(async ({ actor, body }) => templates.runTemplateAction(actor, await body()));
