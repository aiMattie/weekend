import { api } from "@/server/http";
import { adminView, unlinkIdentity } from "@/server/services/sso-settings";

export const DELETE = api<{ id: string }>(({ actor, params }) => { unlinkIdentity(actor, params.id); return adminView(actor); });
