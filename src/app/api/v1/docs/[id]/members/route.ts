import { api } from "@/server/http";
import { docs } from "@/server/services";

/** body: { members: [{ userId, role: "editor"|"viewer" }] } replaces the member list. */
export const PUT = api<{ id: string }>(async ({ actor, params, body }) => docs.setMembers(actor, params.id, (await body()).members ?? []));
