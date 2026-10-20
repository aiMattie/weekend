/**
 * Idempotent seed: account, 12 users, 3 teams, 10 workspaces with folders, 2 demo boards in
 * Delivery. Safe to run repeatedly (looks things up by natural keys). Used by `npm run db:seed`,
 * by the e2e reset endpoint and by tests.
 */
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { systemActor } from "../lib/actor";
import { db } from "./client";
import { ACCOUNT, FASE_STATUS, GONOGO_STATUS, KLANTEN_STATUS, RISICO_STATUS, TEAMS, USERS, WORKSPACES } from "./seed-data";
import { accounts, boards, folders, teamMembers, teams, users, workspaceMembers, workspaces } from "./schema/core";
import * as boardsSvc from "../server/services/boards";
import * as columnsSvc from "../server/services/columns";
import * as groupsSvc from "../server/services/groups";
import * as itemsSvc from "../server/services/items";

export interface SeedResult { accountId: string; userIds: Record<string, string>; workspaceIds: Record<string, string> }

export async function seed(opts: { password?: string; demoBoards?: boolean } = {}): Promise<SeedResult> {
  const password = opts.password ?? process.env.SEED_PASSWORD ?? "Welkom123!";
  const passwordHash = await hashPassword(password);

  const account = db.select().from(accounts).where(eq(accounts.slug, ACCOUNT.slug)).get()
    ?? db.insert(accounts).values(ACCOUNT).returning().get();

  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    const existing = db.select().from(users).where(sql`lower(${users.email}) = ${u.email}`).get();
    if (existing) {
      db.update(users).set({ passwordHash: u.isAiAgent ? null : passwordHash }).where(eq(users.id, existing.id)).run();
      userIds[u.key] = existing.id;
    } else {
      userIds[u.key] = db.insert(users).values({
        accountId: account.id, name: u.name, email: u.email, title: u.title, role: u.role, isAiAgent: !!u.isAiAgent,
        passwordHash: u.isAiAgent ? null : passwordHash,
      }).returning().get().id;
    }
  }

  const teamIds: Record<string, string> = {};
  for (const name of TEAMS) {
    const t = db.select().from(teams).where(and(eq(teams.accountId, account.id), eq(teams.name, name))).get()
      ?? db.insert(teams).values({ accountId: account.id, name }).returning().get();
    teamIds[name] = t.id;
  }
  for (const u of USERS) for (const t of u.teams) {
    db.insert(teamMembers).values({ teamId: teamIds[t], userId: userIds[u.key] }).onConflictDoNothing().run();
  }

  const workspaceIds: Record<string, string> = {};
  let wsPos = 0;
  for (const w of WORKSPACES) {
    wsPos += 1000;
    const ws = db.select().from(workspaces).where(and(eq(workspaces.accountId, account.id), eq(workspaces.name, w.name))).get()
      ?? db.insert(workspaces).values({ accountId: account.id, name: w.name, color: w.color, kind: "open", position: wsPos, createdBy: userIds.admin }).returning().get();
    workspaceIds[w.name] = ws.id;
    for (const uk of ["admin", "owner"]) db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: userIds[uk], role: "owner" }).onConflictDoNothing().run();
    let fPos = 0;
    for (const f of w.folders) {
      fPos += 1000;
      if (!db.select().from(folders).where(and(eq(folders.workspaceId, ws.id), eq(folders.name, f))).get()) {
        db.insert(folders).values({ workspaceId: ws.id, name: f, position: fPos }).run();
      }
    }
  }
  for (const uk of ["pm1", "pm2"]) db.insert(workspaceMembers).values({ workspaceId: workspaceIds.Delivery, userId: userIds[uk], role: "member" }).onConflictDoNothing().run();

  if (opts.demoBoards !== false) seedDemoBoards(account.id, workspaceIds.Delivery, userIds);
  return { accountId: account.id, userIds, workspaceIds };
}

type Ids = Record<string, string>;

function seedDemoBoards(accountId: string, deliveryId: string, u: Ids): void {
  const sys = systemActor(accountId, "system");
  const exists = (name: string) => db.select().from(boards).where(and(eq(boards.workspaceId, deliveryId), eq(boards.name, name), eq(boards.state, "active"))).get();

  if (!exists("Klanten")) {
    const b = boardsSvc.create(sys, { workspaceId: deliveryId, name: "Klanten", description: "Alle klanten van Example: accountmanager, contractvorm en tarieven.", emptyColumns: true });
    const col = (title: string, type: string, key: string, settings?: Record<string, unknown>) => columnsSvc.create(sys, b.id, { title, type, key, settings });
    col("Subitems", "subtasks", "subitems");
    col("Accountmanager", "people", "accountmanager");
    col("Contractvorm(en)", "dropdown", "contractvorm", { labels: ["Fixed price", "Time & materials", "Strippenkaart", "SLA"].map((text, i) => ({ id: i + 1, text })) });
    col("Uurtarief dev", "numbers", "uurtarief_dev", { unit: "€", unitPosition: "left", decimals: 2 });
    col("Uurtarief PM", "numbers", "uurtarief_pm", { unit: "€", unitPosition: "left", decimals: 2 });
    col("Files", "file", "files");
    col("Projecten & fases", "board_relation", "projecten_fases");
    col("Urenregels", "board_relation", "urenregels");
    col("Status", "status", "status", { labels: KLANTEN_STATUS });
    const [g1] = groupsSvc.list(sys, b.id);
    groupsSvc.update(sys, g1.id, { title: "Actieve klanten", color: "#00c875" });
    const g2 = groupsSvc.create(sys, b.id, { title: "Support SLA & strippenkaart", color: "#579bfc" });
    const g3 = groupsSvc.create(sys, b.id, { title: "Taken completed", color: "#a25ddc" });
    const mk = (groupId: string, name: string, values: Record<string, unknown>) => itemsSvc.create(sys, { boardId: b.id, groupId, name, values });
    const delta = mk(g1.id, "Delta", { accountmanager: [u.admin], contractvorm: ["Time & materials"], uurtarief_dev: 95, uurtarief_pm: 105, status: "Working on it" });
    mk(g1.id, "Alpha", { accountmanager: [u.pm1], contractvorm: ["Fixed price"], uurtarief_dev: 90, uurtarief_pm: 100, status: "Working on it" });
    mk(g1.id, "Bravo", { accountmanager: [u.pm2], contractvorm: ["Time & materials", "SLA"], uurtarief_dev: 92.5, uurtarief_pm: 102.5, status: "Stuck" });
    mk(g1.id, "Charlie", { accountmanager: [u.admin], contractvorm: ["Fixed price"], uurtarief_dev: 98, uurtarief_pm: 108, status: "Done" });
    mk(g2.id, "LMS", { accountmanager: [u.pm1], contractvorm: ["Strippenkaart"], uurtarief_dev: 88, status: "Working on it" });
    mk(g3.id, "Echo", { accountmanager: [u.pm2], contractvorm: ["Fixed price"], status: "Done" });
    for (const [n, st] of [["Kick-off plannen", "Done"], ["Contract tekenen", "Working on it"]] as const) {
      itemsSvc.create(sys, { boardId: b.id, parentItemId: delta.id, name: n, values: { status: st, people: [u.admin] } });
    }
  }

  if (!exists("Projecten & Fases")) {
    const b = boardsSvc.create(sys, { workspaceId: deliveryId, name: "Projecten & Fases", description: "Budget, go/no-go en factuurstatus per fase.", emptyColumns: true });
    const col = (title: string, type: string, key: string, settings?: Record<string, unknown>) => columnsSvc.create(sys, b.id, { title, type, key, settings });
    col("Subitems", "subtasks", "subitems");
    col("Klant", "board_relation", "klant");
    col("Verantwoordelijke", "people", "verantwoordelijke");
    col("Fasestatus", "status", "fasestatus", { labels: FASE_STATUS });
    col("Go/no-go datum", "date", "gonogo_datum");
    col("Type", "dropdown", "type", { labels: ["Development", "AI", "Security audit", "Consultancy"].map((text, i) => ({ id: i + 1, text })) });
    col("Uren begroot dev", "numbers", "uren_dev", { unit: "u" });
    col("Uren begroot PM", "numbers", "uren_pm", { unit: "u" });
    col("Sprints", "text", "sprints");
    col("Huidige sprint", "text", "huidige_sprint");
    col("Risico", "status", "risico", { labels: RISICO_STATUS });
    col("Looptijd", "timeline", "looptijd");
    col("On-site dagen begroot", "numbers", "onsite_dagen");
    col("Security audit EUR", "numbers", "security_audit", { unit: "€", unitPosition: "left", decimals: 2 });
    col("Bedrag excl. btw", "numbers", "bedrag", { unit: "€", unitPosition: "left", decimals: 2 });
    col("Go/no-go", "status", "gonogo", { labels: GONOGO_STATUS });
    const [g1] = groupsSvc.list(sys, b.id);
    groupsSvc.update(sys, g1.id, { title: "Actief", color: "#0073ea" });
    const g2 = groupsSvc.create(sys, b.id, { title: "Gepland", color: "#fdab3d" });
    const g3 = groupsSvc.create(sys, b.id, { title: "Afgerond", color: "#00c875" });
    const mk = (groupId: string, name: string, values: Record<string, unknown>) => itemsSvc.create(sys, { boardId: b.id, groupId, name, values });
    mk(g1.id, "Delta - Fase 1: MVP", { verantwoordelijke: [u.admin], fasestatus: "Actief", gonogo_datum: "2026-11-13", type: ["Development"], uren_dev: 320, uren_pm: 40, huidige_sprint: "Sprint 21", risico: "Oranje", bedrag: 36500, gonogo: "Open" });
    mk(g1.id, "LMS - Doorontwikkeling", { verantwoordelijke: [u.pm1], fasestatus: "In review", type: ["Development", "AI"], uren_dev: 200, uren_pm: 24, huidige_sprint: "Sprint 21", risico: "Groen", bedrag: 22800, gonogo: "Go" });
    mk(g2.id, "Charlie - Security audit", { verantwoordelijke: [u.pm2], fasestatus: "Gepland", gonogo_datum: "2026-12-01", type: ["Security audit"], uren_pm: 16, onsite_dagen: 3, security_audit: 7500, bedrag: 9400, risico: "Groen", gonogo: "Open" });
    mk(g2.id, "Alpha - AI Maturity", { verantwoordelijke: [u.admin], fasestatus: "Gepland", type: ["Consultancy", "AI"], uren_pm: 48, bedrag: 6200, risico: "Groen", gonogo: "Open" });
    mk(g3.id, "Echo - Oplevering", { verantwoordelijke: [u.pm2], fasestatus: "Afgerond", type: ["Development"], uren_dev: 120, uren_pm: 12, bedrag: 14200, risico: "Groen", gonogo: "Go" });
  }
}
