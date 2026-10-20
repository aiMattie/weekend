import { api } from "@/server/http";
import { groups } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => groups.archive(actor, params.id));
