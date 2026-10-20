import { api } from "@/server/http";
import { widgets } from "@/server/services";

export const POST = api(async ({ actor, body }) => widgets.previewData(actor, await body()));
