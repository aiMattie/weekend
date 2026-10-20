import { api } from "@/server/http";
import { bugs } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => bugs.stats(actor, params.id));
