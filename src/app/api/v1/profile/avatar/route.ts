import { api } from "@/server/http";
import { profile } from "@/server/services";
import { fileOf } from "@/modules/admin/http";

export const POST = api(async ({ actor, req }) => profile.setAvatar(actor, await fileOf(req)));
export const DELETE = api(({ actor }) => profile.setAvatar(actor, null));
