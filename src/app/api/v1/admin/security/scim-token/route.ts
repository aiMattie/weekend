import { api } from "@/server/http";
import { security } from "@/server/services";

export const POST = api(({ actor }) => security.createScimToken(actor), { status: 201 });
export const DELETE = api(({ actor }) => { security.revokeScimToken(actor); });
