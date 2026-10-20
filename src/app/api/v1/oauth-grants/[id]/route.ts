import { api } from "@/server/http";
import { revokeGrant } from "@/server/services/oauth";

type P = { id: string };
export const DELETE = api<P>(({ actor, params }) => revokeGrant(actor, params.id));
