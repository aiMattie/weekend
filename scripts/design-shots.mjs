/**
 * Design screenshots for docs/design/clone.
 * Start the app on a freshly seeded database (npm run db:reset && npm run db:seed -- --templates), then:
 *   BASE_URL=http://localhost:3111 node scripts/design-shots.mjs [outDir]
 * Logs in as admin@example.com / SEED_PASSWORD, 1680x960. Adds a Kanban view to Projecten & Fases (delete it again to repeat).
 */
import { chromium } from "@playwright/test";
const B=(process.env.BASE_URL ?? "http://localhost:3058").replace(/\/$/, "");
const out = process.argv[2] || "docs/design/clone";
import fs from "node:fs"; fs.mkdirSync(out,{recursive:true});
const b0 = await chromium.launch();
const ctx = await b0.newContext({ baseURL: B, viewport:{width:1680,height:960}, locale:"nl-NL" });
const r=ctx.request;
await r.post("/api/auth/login", { data: { email: "admin@example.com", password: process.env.SEED_PASSWORD ?? "Welkom123!" } });
const bs=await (await r.get("/api/v1/boards")).json();
const ws=await (await r.get("/api/v1/workspaces")).json();
const id=n=>bs.find(b=>b.name===n && true)?.id;
const p = await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); 
const shot=async(name)=>{ await p.waitForTimeout(900); await p.screenshot({path:`${out}/${name}.png`}); console.log("shot",name); };
const board=async(n,name)=>{ await p.goto(`${B}/boards/${id(n)}`); await p.waitForSelector('[data-testid=board-page]'); await shot(name); };
await p.goto(B+"/"); await p.waitForSelector('[data-testid=topbar]');
await p.getByTestId("rail-home-rail").click(); await p.waitForURL(/\/workspaces\//); await shot("00-home");
await board("Projecten & Fases","19-board-projecten-fases");
await board("Klanten","18-board-klanten");
await board("Urenregistratie","20-board-urenregistratie");
// kanban
await p.goto(`${B}/boards/${id("Projecten & Fases")}`); await p.waitForSelector('[data-testid=board-page]');
await p.getByTestId("add-view").click(); await p.waitForTimeout(500); await shot("09-add-view-menu");
await p.getByTestId("add-view-kanban").click(); await p.waitForSelector('[data-testid=kanban-view]'); await shot("12-view-kanban");
await p.goto(`${B}/boards/${id("Klanten")}`); await p.waitForSelector('[data-testid=board-page]');
await p.getByTestId("automate-button").click(); await p.waitForSelector('[data-testid=automation-center]'); await shot("11-automate-center");
const d=ws.find(w=>w.name==="Delivery");
await p.goto(`${B}/workspaces/${d.id}`); await shot("21-workspace-delivery");
console.log(errs);
await b0.close();
