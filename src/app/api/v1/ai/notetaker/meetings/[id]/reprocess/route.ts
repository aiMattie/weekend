import { api } from "@/server/http";
import { notetaker } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => notetaker.reprocess(actor, params.id));
