import { api } from "@/server/http";
import { docs } from "@/server/services";

/** Markdown export (download). */
export const GET = api<{ id: string }>(({ actor, params }) => {
  const md = docs.toMarkdown(actor, params.id);
  const name = (docs.get(actor, params.id).title.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "doc") + ".md";
  return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
});
