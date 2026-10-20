import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** GET: linked monday.com account + schedules (no secrets). */
export const GET = api(({ actor }) => importConnections.adminView(actor));
