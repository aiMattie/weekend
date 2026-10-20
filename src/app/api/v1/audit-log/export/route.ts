import { api } from "@/server/http";
import { audit } from "@/server/services";

export const GET = api(({ actor, query }) =>
  new Response(audit.exportCsv(actor, Object.fromEntries(query.entries())), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` },
  }));
