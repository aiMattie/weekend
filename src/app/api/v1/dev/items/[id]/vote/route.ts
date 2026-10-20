import { api } from "@/server/http";
import { retros } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => retros.vote(actor, params.id));
