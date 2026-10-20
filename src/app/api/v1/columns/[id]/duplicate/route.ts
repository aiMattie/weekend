import { api } from "@/server/http";
import { columns } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => columns.duplicate(actor, params.id), { status: 201 });
