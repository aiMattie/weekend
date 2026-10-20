import { api } from "@/server/http";
import { boards } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => boards.archive(actor, params.id));
