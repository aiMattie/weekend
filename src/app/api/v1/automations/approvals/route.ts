import { api } from "@/server/http";
import { automations } from "@/server/services";

export const GET = api(({ actor }) => automations.listPendingApprovals(actor));
