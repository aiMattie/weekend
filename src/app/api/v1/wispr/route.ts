import { api } from "@/server/http";
import { wispr } from "@/server/services";

/** GET: connection status of the current user. DELETE: unlink Wispr Flow. */
export const GET = api(({ actor }) => wispr.status(actor));
export const DELETE = api(({ actor }) => { wispr.disconnect(actor); });
