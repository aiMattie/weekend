import { api } from "@/server/http";
import { docs } from "@/server/services";

type P = { id: string; versionId: string };
export const GET = api<P>(({ actor, params }) => docs.getVersion(actor, params.id, params.versionId));
/** Restore this version. */
export const POST = api<P>(({ actor, params }) => docs.restoreVersion(actor, params.id, params.versionId));
