/**
 * Workspace templates, idempotent and built on the
 * boards/columns services:
 *   ensureDeliveryTemplate     Delivery: Klanten, Projecten & Fases, Urenregistratie (wired, hours roll up), checklist board
 *   instantiateClientWorkspace one workspace per klant: Kickoff & Roadmap, Builds & Taken, AI Maturity Tracker, Customer Files, Contacten, Gespreksverslagen
 *   ensureDevelopmentTemplate  Development workspace through createDevWorkspaceTemplate (dev module)
 *   seedAllTemplates           everything in one go (`tsx scripts/db-seed.ts --templates`)
 * Hook functions for the automations module are exported at the bottom (`templateHooks`).
 */
import { and, eq } from "drizzle-orm";
import { systemActor, type Actor } from "../../lib/actor";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { parse } from "./_shared";
import { subscribe } from "../../lib/events";
import { db } from "../../db/client";
import { boards, items, workspaces } from "../../db/schema/core";
import * as itemsSvc from "./items";
import * as updatesSvc from "./updates";
import { getBoardRow } from "./_shared";
import { createDevWorkspaceTemplate, type DevTemplateResult } from "./dev-template";
import { ensureDeliveryTemplate, seedChecklistItems, CHECKLIST_STEPS, type DeliveryResult } from "./migration/template-delivery";
import { buildClientBoards, type ClientBoards } from "./migration/template-client";
import { ensureBoard, ensureColumns, ensureRelationPair, ensureWorkspace, keyOf } from "./migration/template-kit";
import { HOURS_QUICK_ENTRY_RECIPE, ensureHoursForm, installHoursRecipe } from "./migration/template-recipes";

export { ensureDeliveryTemplate, buildClientBoards, CHECKLIST_STEPS, HOURS_QUICK_ENTRY_RECIPE };
export type { DeliveryResult, ClientBoards, DevTemplateResult };

export const CLIENT_TEMPLATE_WORKSPACE = "TEMPLATE — Klant Workspace";

export interface ClientWorkspaceResult { workspaceId: string; created: boolean; boards: ClientBoards; klantItemId: string | null }

/**
 * Create (or complete) the workspace of one klant from the template. Idempotent on the workspace name.
 * When the klant exists in Delivery/Klanten the item gets a link to the workspace and its checklist step is ticked.
 */
export function instantiateClientWorkspace(accountId: string, input: { klantnaam: string; color?: string }): ClientWorkspaceResult {
  const name = input.klantnaam.trim();
  if (!name) throw new NotFoundError("Klantnaam");
  const sys = systemActor(accountId, "system");
  const ws = ensureWorkspace(sys, name, { color: input.color ?? "#00c875", description: `Klant-workspace van ${name} (uit het sjabloon)` });
  const boardIds = buildClientBoards(sys, ws.id);
  const klantItemId = linkKlantToWorkspace(sys, name, ws.id);
  return { workspaceId: ws.id, created: ws.created, boards: boardIds, klantItemId };
}

function linkKlantToWorkspace(sys: Actor, klantnaam: string, workspaceId: string): string | null {
  const klanten = deliveryBoards(sys.accountId)?.klanten;
  if (!klanten) return null;
  const item = db.select().from(items).where(and(eq(items.boardId, klanten), eq(items.state, "active"))).all().find((i) => !i.parentItemId && i.name.toLowerCase() === klantnaam.toLowerCase());
  if (!item) return null;
  if (keyOf(klanten, "klant_workspace")) itemsSvc.changeColumnValue(sys, item.id, "klant_workspace", { url: `${process.env.APP_BASE_URL ?? "http://localhost:3058"}/workspaces/${workspaceId}`, text: klantnaam });
  const checklist = deliveryBoards(sys.accountId)?.checklist;
  if (checklist) {
    seedChecklistItems(sys, klanten, checklist);
    const ci = db.select().from(items).where(and(eq(items.boardId, checklist), eq(items.state, "active"))).all().find((i) => i.name.toLowerCase() === klantnaam.toLowerCase());
    if (ci) itemsSvc.changeColumnValue(sys, ci.id, "stap_workspace", { checked: true });
  }
  return item.id;
}

/** Board ids of the Delivery workspace, or null when it is not set up. */
export function deliveryBoards(accountId: string): { workspaceId: string; klanten: string; fases: string; uren: string; checklist: string | null } | null {
  const ws = db.select().from(workspaces).where(and(eq(workspaces.accountId, accountId), eq(workspaces.name, "Delivery"), eq(workspaces.state, "active"))).get();
  if (!ws) return null;
  const find = (n: string) => db.select().from(boards).where(and(eq(boards.workspaceId, ws.id), eq(boards.name, n), eq(boards.state, "active"))).get()?.id;
  const klanten = find("Klanten"), fases = find("Projecten & Fases"), uren = find("Urenregistratie");
  return klanten && fases && uren ? { workspaceId: ws.id, klanten, fases, uren, checklist: find("Klant overstap checklist") ?? null } : null;
}

/** The Development workspace (Sprints, Taken, Epics, Bugs, Retrospectives) from the dev module. */
export function ensureDevelopmentTemplate(accountId: string, opts: { demo?: boolean } = {}): DevTemplateResult {
  return createDevWorkspaceTemplate(accountId, { demo: opts.demo ?? false });
}

/** Hours can optionally point at a task: Urenregistratie.Taak <-> Taken.Uren (needs both templates). */
export function linkUrenToTaken(accountId: string, dev: DevTemplateResult, delivery: DeliveryResult): void {
  const sys = systemActor(accountId, "system");
  ensureRelationPair(sys, { boardId: delivery.boards.uren, key: "taak", title: "Taak" }, { boardId: dev.boards.taken, key: "uren", title: "Uren" }, { allowMultipleA: false });
}

/** Personal boards are replaced by My Work. A short note in Example explains it. */
export function ensureMyWorkNote(accountId: string): string {
  const sys = systemActor(accountId, "system");
  const ws = ensureWorkspace(sys, "Example", { color: "#0073ea" });
  const b = ensureBoard(sys, ws.id, "Werkafspraak: My Work", { description: "Persoonlijke takenborden bouwen we af. Gebruik My Work als persoonlijke takenlijst.", groups: [{ title: "Afspraken", color: "#0073ea" }] });
  ensureColumns(sys, b.id, [{ key: "status", title: "Status", type: "status" }]);
  if (b.created) {
    const it = itemsSvc.create(sys, { boardId: b.id, name: "Gebruik My Work als persoonlijke takenlijst" });
    updatesSvc.create(sys, { itemId: it.id, body: "<p>My Work toont al je taken uit alle borden (Development, Delivery en klant-workspaces). Losse persoonlijke borden zijn daarom niet meer nodig.</p><p>Status en eigenaar zijn altijd ingevuld: een taak zonder eigenaar bestaat niet.</p>" });
  }
  return b.id;
}

export interface SeedTemplatesResult { delivery: DeliveryResult; development: DevTemplateResult | null; templateWorkspaceId: string; myWorkBoardId: string; recipeId: string | null; hoursFormId: string | null }

/** The whole template structure in one call. Safe to run repeatedly. */
export function seedAllTemplates(accountId: string, opts: { demo?: boolean } = {}): SeedTemplatesResult {
  const sys = systemActor(accountId, "system");
  const delivery = ensureDeliveryTemplate(accountId);
  let development: DevTemplateResult | null = null;
  try {
    development = ensureDevelopmentTemplate(accountId, opts);
    linkUrenToTaken(accountId, development, delivery);
  } catch (e) {
    console.warn(`[templates] Development workspace skipped: ${(e as Error).message}`);
  }
  const tpl = ensureWorkspace(sys, CLIENT_TEMPLATE_WORKSPACE, { color: "#ffcb00" });
  buildClientBoards(sys, tpl.id);
  const myWorkBoardId = ensureMyWorkNote(accountId);
  const recipeId = installHoursRecipe(sys, delivery.boards.uren);
  const hoursFormId = ensureHoursForm(sys, delivery.boards.uren);
  return { delivery, development, templateWorkspaceId: tpl.id, myWorkBoardId, recipeId, hoursFormId };
}

/* ------------------------------------------------------------------ hooks for the automations module */

/** Automation action: "new client in Klanten -> create client workspace". Takes the Klanten item id. */
export function createClientWorkspaceForItem(actor: Actor, itemId: string): ClientWorkspaceResult {
  const it = itemsSvc.get(actor, itemId);
  const klanten = deliveryBoards(actor.accountId)?.klanten;
  if (!klanten || it.boardId !== klanten) throw new NotFoundError("Klanten item");
  return instantiateClientWorkspace(actor.accountId, { klantnaam: it.name });
}

/**
 * Opt-in: subscribes to the event bus and creates the client workspace whenever an item is created on
 * Delivery/Klanten. Returns the unsubscribe function. (The automations agent can instead register
 * `createClientWorkspaceForItem` as an action block.)
 */
export function registerClientAutoCreate(): () => void {
  return subscribe((e) => {
    if (e.type !== "item.created" || e.parentItemId || !e.boardId) return;
    try {
      const b = getBoardRow(e.boardId);
      const ws = db.select().from(workspaces).where(eq(workspaces.id, b.workspaceId)).get();
      if (!ws || b.name !== "Klanten" || ws.name !== "Delivery") return;
      const item = db.select().from(items).where(eq(items.id, e.itemId)).get();
      if (item) instantiateClientWorkspace(ws.accountId, { klantnaam: item.name });
    } catch (err) {
      console.warn(`[templates] auto client workspace failed: ${(err as Error).message}`);
    }
  });
}

export const templateHooks = { createClientWorkspaceForItem, registerClientAutoCreate, instantiateClientWorkspace, seedAllTemplates, hoursRecipe: HOURS_QUICK_ENTRY_RECIPE } as const;

/* ------------------------------------------------------------------ admin entry point (REST /api/v1/admin/templates) */

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("all"), demo: z.boolean().default(false) }),
  z.object({ action: z.literal("client"), klantnaam: z.string().trim().min(1).max(120) }),
]);

/** Admin only. `all` builds the template structure, `client` creates one klant workspace from the template. */
export function runTemplateAction(actor: Actor, input: unknown): { action: "all"; result: SeedTemplatesResult } | { action: "client"; result: ClientWorkspaceResult } {
  assertCan(actor, "account:manage");
  const d = parse(actionSchema, input);
  return d.action === "all" ? { action: "all", result: seedAllTemplates(actor.accountId, { demo: d.demo }) } : { action: "client", result: instantiateClientWorkspace(actor.accountId, { klantnaam: d.klantnaam }) };
}
