import { api } from "@/server/http";
import { wispr } from "@/server/services";

export const GET = api(({ actor, query }) => wispr.list(actor, { status: query.get("status") ?? undefined }));
