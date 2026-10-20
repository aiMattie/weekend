import { api } from "@/server/http";
import { account } from "@/server/services";

export const GET = api(({ actor }) => account.planOverview(actor));
/** body: { plan } (no payment: only switches the limits) */
export const PUT = api(async ({ actor, body }) => account.setPlan(actor, (await body()).plan));
