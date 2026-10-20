import { api } from "@/server/http";
import { dashboards } from "@/server/services";

export const POST = api<{ id: string }>(({ actor, params }) => dashboards.duplicateWidget(actor, params.id), { status: 201 });
