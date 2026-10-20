import { api } from "@/server/http";
import { wispr } from "@/server/services";

type P = { id: string };
/** POST { personal: boolean }: hide a meeting as personal (or show it again). */
export const POST = api<P>(async ({ actor, params, body }) => wispr.setPersonal(actor, params.id, (await body()).personal !== false));
