import { api } from "@/server/http";
import { automations } from "@/server/services";

export const GET = api<{ runId: string }>(({ actor, params }) => automations.getRun(actor, params.runId));
