import { api } from "@/server/http";
import { whiteboards } from "@/server/services";

/** Cheap poll target for realtime-ish refresh. */
export const GET = api<{ id: string }>(({ actor, params }) => whiteboards.getVersion(actor, params.id));
