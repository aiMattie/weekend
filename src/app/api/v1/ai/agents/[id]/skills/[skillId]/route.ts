import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string; skillId: string };
export const PATCH = api<P>(async ({ actor, params, body }) => agents.updateSkill(actor, params.id, params.skillId, await body()));
export const DELETE = api<P>(({ actor, params }) => agents.removeSkill(actor, params.id, params.skillId));
