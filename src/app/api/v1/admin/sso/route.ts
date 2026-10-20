import { api } from "@/server/http";
import { adminView, updateSettings } from "@/server/services/sso-settings";

export const GET = api(({ actor }) => adminView(actor));
export const PUT = api(async ({ actor, body }) => updateSettings(actor, await body()));
