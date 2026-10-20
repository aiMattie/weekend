import { api } from "@/server/http";
import { automations } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => automations.duplicate(actor, params.id), { status: 201 });
