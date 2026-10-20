import { api } from "@/server/http";
import { automations } from "@/server/services";

export const POST = api<{ runId: string }>(({ actor, params }) => automations.retryRun(actor, params.runId));
