import { api } from "@/server/http";
import { views } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => views.setDefault(actor, params.id));
