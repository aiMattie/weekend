import { api } from "@/server/http";
import { sessions } from "@/server/services";

type P = { id: string };
export const DELETE = api<P>(({ actor, params }) => { sessions.revoke(actor, params.id); });
