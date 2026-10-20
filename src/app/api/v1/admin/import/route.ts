import { api } from "@/server/http";
import { importer } from "@/server/services";

/** GET: job history (admin only). POST: start a monday.com import (dry-run unless apply=true); returns the running job. */
export const GET = api(({ actor }) => importer.listJobs(actor));
export const POST = api(async ({ actor, body }) => importer.startImportJob(actor, await body()), { status: 202 });
