/**
 * npm run db:seed                      account, users, workspaces + demo boards
 *   --no-demo                          skip the demo boards (e.g. before importing a real monday.com account)
 *   --templates                        also build the whole template structure (module M): Delivery (Klanten,
 *                                      Projecten & Fases, Urenregistratie, checklist), Development, the klant-workspace
 *                                      template and the hours recipe. Idempotent.
 *   --klant "Naam A,Naam B"            additionally create klant-workspaces from the template (with --templates)
 */
import "./_env";
import { parseArgs } from "node:util";
import { seed } from "../src/db/seed";

const { values: a } = parseArgs({ options: { templates: { type: "boolean", default: false }, "no-demo": { type: "boolean", default: false }, klant: { type: "string" } }, strict: false });

seed({ demoBoards: !a["no-demo"] }).then(async (r) => {
  console.log(`Seeded account ${r.accountId}: ${Object.keys(r.userIds).length} users, ${Object.keys(r.workspaceIds).length} workspaces (${process.env.DATABASE_URL || "file:data/app.db"})`);
  if (a.templates) {
    const { seedAllTemplates, instantiateClientWorkspace } = await import("../src/server/services/templates");
    const t = seedAllTemplates(r.accountId);
    console.log(`Templates: Delivery ${Object.keys(t.delivery.boards).length} boards, Development ${t.development ? Object.keys(t.development.boards).length : 0} boards, klant-template workspace ${t.templateWorkspaceId}, hours recipe ${t.recipeId ?? "not installed"}`);
    for (const name of String(a.klant ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const c = instantiateClientWorkspace(r.accountId, { klantnaam: name });
      console.log(`  klant-workspace "${name}" ${c.created ? "created" : "already existed"} (${c.workspaceId})`);
    }
  }
}).catch((e) => { console.error(e); process.exit(1); });
