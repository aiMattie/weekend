import { api } from "@/server/http";
import { widgets } from "@/server/services";

export const GET = api<{ id: string }>(({ actor, params }) => widgets.widgetData(actor, params.id));
