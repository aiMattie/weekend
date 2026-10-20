import { api } from "@/server/http";
import { docs } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => docs.listVersions(actor, params.id));
/** Save a version of the current state. */
export const POST = api<P>(({ actor, params }) => docs.createVersion(actor, params.id), { status: 201 });
