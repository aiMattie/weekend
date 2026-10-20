import { api } from "@/server/http";
import { twofactor } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => { twofactor.reset(actor, params.id); });
