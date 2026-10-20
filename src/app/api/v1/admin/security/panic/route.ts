import { api } from "@/server/http";
import { security } from "@/server/services";
import { sidOf } from "@/modules/admin/http";

/** Locks the account. Returns the recovery code once. */
export const POST = api(async ({ actor, req }) => security.panic(actor, await sidOf(req)));
