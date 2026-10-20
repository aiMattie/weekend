import { api } from "@/server/http";
import { integrations } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => integrations.regenerateToken(actor, params.id));
