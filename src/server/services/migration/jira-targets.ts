/** Where Jira data lands in the clone, and lookups needed while writing (users, klanten, fases). */
import { and, eq, sql } from "drizzle-orm";
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { boards, items, teamMembers, teams, users, workspaces } from "../../../db/schema/core";
import { createDevWorkspaceTemplate, type DevTemplateResult } from "../dev-template";
import { ensureDeliveryTemplate, type DeliveryResult } from "./template-delivery";
import { addDropdownLabel, ensureColumns, keyOf } from "./template-kit";
import { linkUrenToTakenSafe } from "./jira-link";
import type { JUser } from "./jira-types";
import { ensureSubitemColumns } from "../items";
import { createItemRow, firstActiveGroup } from "./item-writer";

export interface JiraTargets {
  delivery: DeliveryResult | null;
  dev: DevTemplateResult | null;
  /** apply=false and templates missing: ids are placeholders */
  placeholder: boolean;
}

/** Read-only lookup of the template boards (dry-run must not write anything). */
function findTargets(accountId: string): JiraTargets | null {
  const find = (wsName: string, name: string) => {
    const ws = db.select().from(workspaces).where(and(eq(workspaces.accountId, accountId), eq(workspaces.name, wsName), eq(workspaces.state, "active"))).get();
    return ws ? db.select().from(boards).where(and(eq(boards.workspaceId, ws.id), eq(boards.name, name), eq(boards.state, "active"))).get() : undefined;
  };
  const klanten = find("Delivery", "Klanten"), fases = find("Delivery", "Projecten & Fases"), uren = find("Delivery", "Urenregistratie");
  const sprints = find("Development", "Sprints"), taken = find("Development", "Taken"), epics = find("Development", "Epics");
  if (!klanten || !fases || !uren || !sprints || !taken || !epics) return null;
  const bug = find("Development", "Bugs"), retro = find("Development", "Retrospectives");
  return {
    delivery: { workspaceId: klanten.workspaceId, boards: { klanten: klanten.id, fases: fases.id, uren: uren.id, checklist: find("Delivery", "Klant overstap checklist")?.id ?? "" }, columns: { urenDevMirror: "", urenPmMirror: "" } },
    dev: { workspaceId: taken.workspaceId, boards: { sprints: sprints.id, taken: taken.id, epics: epics.id, bugs: bug?.id ?? "", retrospectives: retro?.id ?? "" } },
    placeholder: false,
  };
}

/** Find the template boards; in apply mode create what is missing (Delivery + Development). */
export function resolveTargets(actor: Actor, apply: boolean): JiraTargets {
  if (!apply) return findTargets(actor.accountId) ?? { delivery: null, dev: null, placeholder: true };
  const delivery = ensureDeliveryTemplate(actor.accountId);
  const dev = createDevWorkspaceTemplate(actor.accountId);
  linkUrenToTakenSafe(actor.accountId, dev, delivery);
  // Taken/Epics need a Files column for Jira attachments; subitems get a Jira key column
  for (const b of [dev.boards.taken, dev.boards.epics]) ensureColumns(actor, b, [{ key: "files", title: "Files", type: "file" }]);
  ensureColumns(actor, dev.boards.taken, [{ key: "jira_key", title: "Jira key", type: "text" }]);
  ensureColumns(actor, dev.boards.epics, [{ key: "jira_key", title: "Jira key", type: "text" }]);
  ensureSubitemColumns(dev.boards.taken); // defaults first, otherwise they would never be created
  ensureColumns(actor, dev.boards.taken, [{ key: "jira_key", title: "Jira key", type: "text", scope: "subitem" }]);
  return { delivery, dev, placeholder: false };
}

/* ------------------------------------------------------------------ users */

export interface UserMapper {
  map(u: JUser | null | undefined): string | null;
  isPm(userId: string): boolean;
  unmapped: Map<string, string>;
}

export function userMapper(accountId: string, explicit: Record<string, string> = {}): UserMapper {
  const all = db.select().from(users).where(eq(users.accountId, accountId)).all();
  const byEmail = new Map(all.map((u) => [u.email.toLowerCase(), u.id]));
  const byName = new Map(all.map((u) => [u.name.trim().toLowerCase(), u.id]));
  const first = new Map<string, string[]>();
  for (const u of all) { const f = u.name.trim().split(/\s+/)[0].toLowerCase(); first.set(f, [...(first.get(f) ?? []), u.id]); }
  const pmTeam = db.select().from(teams).where(and(eq(teams.accountId, accountId), sql`lower(${teams.name}) like 'projectmanagement%'`)).get();
  const pms = new Set(pmTeam ? db.select().from(teamMembers).where(eq(teamMembers.teamId, pmTeam.id)).all().map((m) => m.userId) : []);
  const unmapped = new Map<string, string>();
  const cache = new Map<string, string | null>();
  return {
    unmapped,
    isPm: (id) => pms.has(id),
    map(u) {
      if (!u) return null;
      if (cache.has(u.accountId)) return cache.get(u.accountId)!;
      const ex = explicit[u.accountId] ?? (u.emailAddress ? explicit[u.emailAddress.toLowerCase()] : undefined);
      const exId = ex ? byEmail.get(ex.toLowerCase()) ?? (/^\d+$/.test(ex) ? ex : undefined) : undefined;
      const f = u.displayName.trim().split(/\s+/)[0].toLowerCase();
      const firstHits = first.get(f) ?? [];
      const id = exId ?? (u.emailAddress ? byEmail.get(u.emailAddress.toLowerCase()) : undefined) ?? byName.get(u.displayName.trim().toLowerCase()) ?? (firstHits.length === 1 ? firstHits[0] : undefined) ?? null;
      if (!id) unmapped.set(u.accountId, u.displayName);
      cache.set(u.accountId, id);
      return id;
    },
  };
}

/* ------------------------------------------------------------------ klant + fase */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The Klanten item for a Jira project: by Jira-project column, else by name; created when missing. */
export function ensureKlantItem(actor: Actor, klantenBoardId: string, project: { key: string; name: string }): { id: string; created: boolean } {
  const rows = db.select().from(items).where(and(eq(items.boardId, klantenBoardId), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
  const jiraCol = keyOf(klantenBoardId, "jira_project");
  const byKey = jiraCol ? rows.find((i) => String((i.values[jiraCol.id] as string | undefined) ?? "").toUpperCase() === project.key.toUpperCase()) : undefined;
  const hit = byKey ?? rows.find((i) => norm(i.name) === norm(project.name)) ?? rows.find((i) => norm(i.name) === norm(project.key));
  if (hit) {
    if (jiraCol && !hit.values[jiraCol.id]) db.update(items).set({ values: { ...hit.values, [jiraCol.id]: project.key } }).where(eq(items.id, hit.id)).run();
    return { id: hit.id, created: false };
  }
  const row = createItemRow(actor, { boardId: klantenBoardId, groupId: firstActiveGroup(klantenBoardId), name: project.name, raw: { jira_project: project.key } });
  return { id: row.id, created: true };
}

/** Fases (Projecten & Fases items) that belong to a klant, via the Klant relation. */
export function fasesOfKlant(fasesBoardId: string, klantItemId: string): { id: string; name: string; active: boolean }[] {
  const klantCol = keyOf(fasesBoardId, "klant");
  const statusCol = keyOf(fasesBoardId, "fasestatus");
  if (!klantCol) return [];
  const labels = (statusCol?.settings.labels as { id: number; text: string }[] | undefined) ?? [];
  return db.select().from(items).where(and(eq(items.boardId, fasesBoardId), eq(items.state, "active"))).all()
    .filter((i) => !i.parentItemId && ((i.values[klantCol.id] as { linkedPulseIds?: { linkedPulseId: string }[] } | undefined)?.linkedPulseIds ?? []).some((l) => String(l.linkedPulseId) === klantItemId))
    .map((i) => {
      const idx = (i.values[statusCol?.id ?? ""] as { index?: number } | undefined)?.index;
      return { id: i.id, name: i.name, active: labels.find((l) => l.id === idx)?.text === "Actief" };
    });
}

/** Epic -> fase: the fase whose name shares the epic's words, else the active fase, else the only fase. */
export function pickFase(fases: { id: string; name: string; active: boolean }[], epicSummary: string): { id: string; name: string } | null {
  if (!fases.length) return null;
  const e = norm(epicSummary);
  const byName = fases.find((f) => { const n = norm(f.name.replace(/^.*?[-–]\s*/, "")); return n && (e.includes(n) || n.includes(e)); });
  const actives = fases.filter((f) => f.active);
  return byName ?? (actives.length === 1 ? actives[0] : fases.length === 1 ? fases[0] : actives[0] ?? null);
}

export { addDropdownLabel };
