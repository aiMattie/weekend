import { api } from "@/server/http";
import { account } from "@/server/services";
import { readImage } from "@/modules/admin/lib/images";
import { fileOf, imageResponse } from "@/modules/admin/http";

export const GET = api(({ actor }) => imageResponse(readImage("logo", actor.accountId)));
export const PUT = api(async ({ actor, req }) => account.setLogo(actor, await fileOf(req)));
export const DELETE = api(({ actor }) => account.setLogo(actor, null));
