import { api } from "@/server/http";
import { teams } from "@/server/services";

type P = { id: string };
/** body: { userIds: string[] } replaces the member list */
export const PUT = api<P>(async ({ actor, params, body }) => teams.setMembers(actor, params.id, (await body()).userIds));
