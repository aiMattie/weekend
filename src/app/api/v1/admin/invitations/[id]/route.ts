import { api } from "@/server/http";
import { members } from "@/server/services";
import { originOf } from "@/modules/admin/http";

type P = { id: string };
/** resend: new link */
export const POST = api<P>(({ actor, params, req }) => members.resendInvitation(actor, params.id, { origin: originOf(req) }));
export const DELETE = api<P>(({ actor, params }) => { members.revokeInvitation(actor, params.id); });
