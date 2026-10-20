import { api } from "@/server/http";
import { account } from "@/server/services";

/** body: { key, value } (value null = unlimited, omitted = back to plan default) */
export const PUT = api(async ({ actor, body }) => { const b = await body(); return account.setLimitOverride(actor, b.key, b.value); });
