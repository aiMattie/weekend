import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** GET: linked monday.com / Jira accounts + schedules (no secrets). */
export const GET = api(({ actor }) => importConnections.adminView(actor));
