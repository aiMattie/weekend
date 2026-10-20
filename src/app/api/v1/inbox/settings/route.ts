import { api } from "@/server/http";
import { inbox } from "@/server/services";

export const GET = api(({ actor }) => inbox.getSettings(actor));
/** body: { settings: [{ eventType, inApp?, email? }] } */
export const PUT = api(async ({ actor, body }) => inbox.updateSettings(actor, (await body()).settings));
