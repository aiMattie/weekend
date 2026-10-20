import { api } from "@/server/http";
import { guests } from "@/server/services";
import { originOf } from "@/modules/admin/http";

export const GET = api(({ actor }) => guests.overview(actor));
export const POST = api(async ({ actor, body, req }) => guests.inviteGuest(actor, await body(), { origin: originOf(req) }), { status: 201 });
/** guest settings: { enabled?, restrictedViews? } */
export const PATCH = api(async ({ actor, body }) => guests.updateSettings(actor, await body()));
