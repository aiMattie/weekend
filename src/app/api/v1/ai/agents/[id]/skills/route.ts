import { api } from "@/server/http";
import { agents } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => agents.listSkills(actor, params.id));
export const POST = api<P>(async ({ actor, params, body }) => agents.addSkill(actor, params.id, await body()), { status: 201 });
