import { api } from "@/server/http";
import { dashboards } from "@/server/services";

export const POST = api<{ id: string }>(async ({ actor, params, body }) => dashboards.createWidget(actor, params.id, await body()), { status: 201 });
