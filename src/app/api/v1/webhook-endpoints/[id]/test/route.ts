import { api } from "@/server/http";
import { webhooks } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => webhooks.test(actor, params.id));
