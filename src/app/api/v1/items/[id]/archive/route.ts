import { api } from "@/server/http";
import { items } from "@/server/services";


export const POST = api<{ id: string }>(({ actor, params }) => items.archive(actor, params.id));
