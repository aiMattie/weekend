import { api } from "@/server/http";
import { importer } from "@/server/services";

export const GET = api<{ id: string }>(({ actor, params }) => importer.getJob(actor, params.id));
